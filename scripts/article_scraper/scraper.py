#!/usr/bin/env python3
"""
Article Scraper — Selenium puro, acessa os sites diretamente.

Fontes:
  • arXiv            https://arxiv.org/search
  • IEEE Xplore      https://ieeexplore.ieee.org
  • Semantic Scholar https://www.semanticscholar.org
  • ACM DL           https://dl.acm.org
  • Springer         https://link.springer.com
  • Portal CAPES     https://www.periodicos.capes.gov.br  (VPN)

Uso:
  python scraper.py
  python scraper.py --sources arxiv ieee
  python scraper.py --query "transformer code generation" --max 40
  python scraper.py --headless false        # ver o browser
  python scraper.py --list-existing
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from urllib.parse import quote_plus, urljoin, urlparse

import requests
import yaml
from bs4 import BeautifulSoup
from kafka import KafkaProducer
from gridfs import GridFS
from pymongo import MongoClient
from rich.console import Console
from rich.panel import Panel
from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn, TimeElapsedColumn
from rich.table import Table
from selenium import webdriver
from selenium.common.exceptions import (
    NoSuchElementException,
    StaleElementReferenceException,
    TimeoutException,
)
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

console = Console()


DEFAULT_MONGODB_URI = "mongodb://localhost:27017"
DEFAULT_KAFKA_BOOTSTRAP = ["localhost:9092"]
DEFAULT_KAFKA_TOPIC = "article-scraper.articles"
TRUSTED_ARTICLE_HOST_SUFFIXES = (
    "arxiv.org",
    "doi.org",
    "ieee.org",
    "semanticscholar.org",
    "acm.org",
    "springer.com",
    "springernature.com",
    "sciencedirect.com",
    "elsevier.com",
    "core.ac.uk",
    "dblp.org",
    "paperswithcode.com",
    "openreview.net",
    "nature.com",
    "sciencemag.org",
    "wiley.com",
    "onlinelibrary.wiley.com",
    "tandfonline.com",
    "sagepub.com",
    "frontiersin.org",
    "mdpi.com",
    "plos.org",
    "biomedcentral.com",
    "jmlr.org",
    "aclweb.org",
    "aclanthology.org",
    "aaai.org",
    "siam.org",
    "cambridge.org",
    "oup.com",
)
UNWANTED_ARTICLE_HOSTS = {
    "linkedin.com",
    "www.linkedin.com",
    "twitter.com",
    "www.twitter.com",
    "x.com",
    "www.x.com",
    "facebook.com",
    "www.facebook.com",
    "instagram.com",
    "www.instagram.com",
    "youtube.com",
    "www.youtube.com",
}


# ──────────────────────────────────────────────────────────────────────────────
# Model
# ──────────────────────────────────────────────────────────────────────────────

def make_article(**kw) -> dict:
    title = kw.get("title", "").strip()
    doi   = kw.get("doi", "").strip()
    uid   = doi if doi else "hash:" + hashlib.md5(title.lower().encode()).hexdigest()[:12]
    return {
        "id":             uid,
        "source":         kw.get("source", ""),
        "title":          title,
        "authors":        kw.get("authors", []),
        "abstract":       kw.get("abstract", "").strip(),
        "doi":            doi,
        "url":            kw.get("url", "").strip(),
        "pdf_url":        kw.get("pdf_url", "").strip(),
        "year":           kw.get("year"),
        "journal":        kw.get("journal", "").strip(),
        "venue":          kw.get("venue", "").strip(),
        "keywords":       kw.get("keywords", []),
        "citation_count": kw.get("citation_count"),
        "open_access":    kw.get("open_access", False),
        "fetched_at":     datetime.now(timezone.utc).isoformat(),
    }


# ──────────────────────────────────────────────────────────────────────────────
# Browser
# ──────────────────────────────────────────────────────────────────────────────

def build_driver(cfg: dict) -> webdriver.Chrome:
    import tempfile

    opts = Options()

    headless = cfg.get("headless", True)
    if headless:
        opts.add_argument("--headless=new")  # Chrome 112+

    # Temp profile evita crash do Chrome 146 no Windows ao iniciar headless
    tmp_profile = tempfile.mkdtemp(prefix="chrome_scraper_")
    opts.add_argument(f"--user-data-dir={tmp_profile}")

    opts.add_argument(f"--window-size={cfg.get('window_width',1400)},{cfg.get('window_height',900)}")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--no-first-run")
    opts.add_argument("--no-default-browser-check")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_argument("--disable-infobars")
    opts.add_argument("--disable-extensions")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    opts.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )

    # Selenium Manager (built-in Selenium 4.10+) baixa automaticamente o
    # chromedriver compatível com qualquer versão do Chrome — sem webdriver-manager.
    try:
        driver = webdriver.Chrome(options=opts)
    except Exception as err:
        console.print(
            "[red]Não foi possível iniciar o Chrome.\n"
            "Certifique-se de que o Google Chrome está instalado.\n"
            f"Erro: {err}[/]"
        )
        raise

    driver.execute_script(
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    )
    driver.set_page_load_timeout(cfg.get("page_load_timeout", 30))
    driver.implicitly_wait(cfg.get("implicit_wait", 5))
    return driver


def wait_for(driver: webdriver.Chrome, css: str, timeout: int = 15) -> bool:
    try:
        WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, css))
        )
        return True
    except TimeoutException:
        return False


def human_delay(min_s: float = 1.5, max_s: float = 3.5) -> None:
    time.sleep(random.uniform(min_s, max_s))


def scroll_down(driver: webdriver.Chrome, times: int = 3) -> None:
    for _ in range(times):
        driver.execute_script("window.scrollBy(0, 600)")
        time.sleep(0.4)


def safe_text(el) -> str:
    try:
        return el.text.strip()
    except Exception:
        return ""


def soup_of(driver: webdriver.Chrome) -> BeautifulSoup:
    return BeautifulSoup(driver.page_source, "lxml")


def screenshot_on_error(driver: webdriver.Chrome, name: str, screenshots_dir: Path) -> None:
    try:
        screenshots_dir.mkdir(parents=True, exist_ok=True)
        path = screenshots_dir / f"{name}_{int(time.time())}.png"
        driver.save_screenshot(str(path))
        console.print(f"    [dim]Screenshot: {path.name}[/]")
    except Exception:
        pass


# ──────────────────────────────────────────────────────────────────────────────
# Source: arXiv  (via Atom API — sem Selenium, sem bot detection)
# ──────────────────────────────────────────────────────────────────────────────

def scrape_arxiv(driver: webdriver.Chrome, query: str, cfg: dict,
                 max_results: int, exec_cfg: dict) -> list[dict]:
    del driver, exec_cfg  # usa API REST, não Selenium
    import xml.etree.ElementTree as ET

    results = []
    start_year = cfg.get("start_year", 0)
    sort_by    = cfg.get("sort", "relevance")      # relevance | lastUpdatedDate | submittedDate
    sort_order = "descending"
    per_page   = min(50, max_results)
    start      = 0

    NS = {
        "atom":   "http://www.w3.org/2005/Atom",
        "arxiv":  "http://arxiv.org/schemas/atom",
        "opensearch": "http://a9.com/-/spec/opensearch/1.1/",
    }

    while len(results) < max_results:
        url = (
            f"https://export.arxiv.org/api/query"
            f"?search_query=all:{quote_plus(query)}"
            f"&start={start}&max_results={per_page}"
            f"&sortBy={sort_by}&sortOrder={sort_order}"
        )
        console.print(f"    [dim]arXiv API p.{start//per_page+1}: {url[:80]}[/]")

        try:
            r = requests.get(url, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
            r.raise_for_status()
        except Exception as e:
            console.print(f"    [red]arXiv API error: {e}[/]")
            break

        try:
            root = ET.fromstring(r.content)
        except ET.ParseError as e:
            console.print(f"    [red]arXiv XML parse error: {e}[/]")
            break

        entries = root.findall("atom:entry", NS)
        if not entries:
            break

        for entry in entries:
            if len(results) >= max_results:
                break

            title = (entry.findtext("atom:title", "", NS) or "").strip().replace("\n", " ")
            if not title:
                continue

            abstract = (entry.findtext("atom:summary", "", NS) or "").strip()
            authors  = [
                a.findtext("atom:name", "", NS)
                for a in entry.findall("atom:author", NS)
            ]

            # ID → URLs  (https://arxiv.org/abs/2301.12345v1)
            raw_id  = entry.findtext("atom:id", "", NS) or ""
            arxiv_id = re.sub(r"v\d+$", "", raw_id.split("/abs/")[-1])
            art_url = f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else ""
            pdf_url = f"https://arxiv.org/pdf/{arxiv_id}" if arxiv_id else ""

            # DOI
            doi = entry.findtext("arxiv:doi", "", NS) or ""

            # Ano
            year = None
            published = entry.findtext("atom:published", "", NS) or ""
            m = re.search(r"(\d{4})", published)
            if m:
                year = int(m.group(1))

            if start_year and year and year < start_year:
                continue

            # Categorias
            cats = [c.get("term", "") for c in entry.findall("atom:category", NS)]

            results.append(make_article(
                source="arxiv",
                title=title,
                authors=authors,
                abstract=abstract,
                doi=doi,
                url=art_url,
                pdf_url=pdf_url,
                year=year,
                venue=" | ".join(cats[:3]),
                keywords=cats,
                open_access=True,
            ))

        if len(entries) < per_page or len(results) >= max_results:
            break

        start += per_page
        time.sleep(3)  # arXiv pede ≥3s entre requests

    return results


# ──────────────────────────────────────────────────────────────────────────────
# Source: IEEE Xplore
# ──────────────────────────────────────────────────────────────────────────────

def scrape_ieee(driver: webdriver.Chrome, query: str, cfg: dict,
                max_results: int, exec_cfg: dict) -> list[dict]:
    results = []
    start_year = cfg.get("start_year", 0)
    content_type = cfg.get("content_type", "")
    extra_delay = cfg.get("extra_delay", 3)

    q = quote_plus(query)
    url = f"https://ieeexplore.ieee.org/search/searchresult.jsp?queryText={q}"
    if start_year:
        url += f"&ranges={start_year}_2025_Year"
    if content_type:
        url += f"&newsearch=true&contentType={quote_plus(content_type)}"

    console.print(f"    [dim]IEEE: {url[:80]}[/]")

    try:
        driver.get(url)
    except Exception as e:
        console.print(f"    [red]IEEE load error: {e}[/]")
        return []

    # IEEE usa Angular — aguarda os cards carregarem
    time.sleep(extra_delay)
    if not wait_for(driver, "xpl-search-results, .List-results-items, xpl-results-item", timeout=20):
        console.print("    [yellow]IEEE: timeout aguardando resultados[/]")
        return []

    time.sleep(2)
    scroll_down(driver, 4)
    time.sleep(1)

    page_num = 1
    while len(results) < max_results:
        soup = soup_of(driver)

        # Cards de resultado
        cards = soup.select("xpl-results-item")
        if not cards:
            # Fallback: tenta selectors alternativos
            cards = soup.select(".List-results-items .row, .result-item")

        if not cards:
            console.print(f"    [yellow]IEEE p.{page_num}: nenhum card encontrado[/]")
            break

        for card in cards:
            if len(results) >= max_results:
                break

            # Título
            title_el = (card.select_one("h2 a") or card.select_one(".result-item-title a")
                        or card.select_one("a[href*='/document/']"))
            title = title_el.get_text(strip=True) if title_el else ""
            if not title:
                continue

            # URL
            art_url = ""
            if title_el:
                href = title_el.get("href", "")
                art_url = urljoin("https://ieeexplore.ieee.org", href)

            # Autores
            authors = []
            authors_el = card.select(".authors-info a, .author-name")
            authors = [a.get_text(strip=True) for a in authors_el if a.get_text(strip=True)]

            # Journal/venue
            pub_el = card.select_one(".publisher-info-container, .publication-title")
            journal = pub_el.get_text(strip=True) if pub_el else ""

            # Ano
            year = None
            year_el = card.select_one(".publisher-info-container")
            if year_el:
                m = re.search(r"\b(20\d{2}|19\d{2})\b", year_el.get_text())
                if m:
                    year = int(m.group(1))

            # Abstract (geralmente não aparece na lista)
            abs_el = card.select_one(".abstract-text")
            abstract = abs_el.get_text(strip=True) if abs_el else ""

            # DOI
            doi = ""
            doi_el = card.select_one("[data-doi], .doi")
            if doi_el:
                doi = doi_el.get("data-doi", "") or doi_el.get_text(strip=True)

            # PDF
            pdf_url = ""
            pdf_el = card.select_one("a[href*='/stamp/'], a.icon-pdf")
            if pdf_el:
                pdf_url = urljoin("https://ieeexplore.ieee.org", pdf_el.get("href", ""))

            # Open access badge
            oa = bool(card.select_one(".oa-badge, [class*='open-access']"))

            results.append(make_article(
                source="ieee",
                title=title,
                authors=authors,
                abstract=abstract,
                doi=doi,
                url=art_url,
                pdf_url=pdf_url,
                year=year,
                journal=journal,
                open_access=oa,
            ))

        # Próxima página
        if len(results) >= max_results:
            break

        try:
            next_btn = driver.find_element(
                By.CSS_SELECTOR,
                "button.stats-Paginiation-Right:not([disabled]), "
                "[aria-label='Next page']:not([disabled])"
            )
            driver.execute_script("arguments[0].click();", next_btn)
            page_num += 1
            time.sleep(extra_delay + random.uniform(1, 2))
            scroll_down(driver, 3)
        except NoSuchElementException:
            break

    return results


# ──────────────────────────────────────────────────────────────────────────────
# Source: Semantic Scholar  (via API Graph v1 — sem Selenium, sem bot detection)
# ──────────────────────────────────────────────────────────────────────────────

def scrape_semantic_scholar(driver: webdriver.Chrome, query: str, cfg: dict,
                             max_results: int, exec_cfg: dict) -> list[dict]:
    del driver, exec_cfg  # usa API REST, não Selenium
    results = []
    start_year = cfg.get("start_year", 0)

    fields = (
        "title,authors,abstract,year,venue,externalIds,"
        "openAccessPdf,citationCount,url"
    )
    base_url = "https://api.semanticscholar.org/graph/v1/paper/search"
    per_page = min(100, max_results)
    offset   = 0

    while len(results) < max_results:
        params: dict = {
            "query":  query,
            "fields": fields,
            "offset": offset,
            "limit":  per_page,
        }
        if start_year:
            params["year"] = f"{start_year}-"

        console.print(f"    [dim]S2 API offset={offset}: {query[:55]}[/]")

        try:
            r = requests.get(base_url, params=params, timeout=30,
                             headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code == 429:
                console.print("    [yellow]S2: rate limit — aguardando 15s[/]")
                time.sleep(15)
                continue
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            console.print(f"    [red]S2 API error: {e}[/]")
            break

        papers = data.get("data", [])
        if not papers:
            break

        for paper in papers:
            if len(results) >= max_results:
                break

            title = (paper.get("title") or "").strip()
            if not title:
                continue

            authors        = [a.get("name", "") for a in (paper.get("authors") or [])]
            abstract       = paper.get("abstract") or ""
            year           = paper.get("year")
            venue          = paper.get("venue") or ""
            citation_count = paper.get("citationCount")

            ext  = paper.get("externalIds") or {}
            doi  = ext.get("DOI", "")
            arxiv_id = ext.get("ArXiv", "")

            art_url = paper.get("url") or ""
            oa_pdf  = paper.get("openAccessPdf") or {}
            pdf_url = oa_pdf.get("url", "") or ""
            if not pdf_url and arxiv_id:
                pdf_url = f"https://arxiv.org/pdf/{arxiv_id}"

            results.append(make_article(
                source="semantic_scholar",
                title=title,
                authors=authors,
                abstract=abstract,
                doi=doi,
                url=art_url,
                pdf_url=pdf_url,
                year=year,
                journal=venue,
                citation_count=citation_count,
                open_access=bool(pdf_url),
            ))

        if len(papers) < per_page or len(results) >= max_results:
            break

        offset += per_page
        time.sleep(1)  # S2 API: 1 req/s sem chave

    return results


# ──────────────────────────────────────────────────────────────────────────────
# Source: ACM Digital Library
# ──────────────────────────────────────────────────────────────────────────────

def scrape_acm(driver: webdriver.Chrome, query: str, cfg: dict,
               max_results: int, exec_cfg: dict) -> list[dict]:
    results = []
    start_year = cfg.get("start_year", 0)
    content_type = cfg.get("content_type", "")

    q = quote_plus(query)
    url = f"https://dl.acm.org/action/doSearch?AllField={q}&expand=all"
    if start_year:
        url += f"&AfterYear={start_year}"
    if content_type:
        url += f"&ContentItemType={content_type}"

    console.print(f"    [dim]ACM: {url[:80]}[/]")

    try:
        driver.get(url)
    except Exception as e:
        console.print(f"    [red]ACM load error: {e}[/]")
        return []

    if not wait_for(driver, ".issue-item, .search__item", timeout=20):
        console.print("    [yellow]ACM: timeout aguardando resultados[/]")
        return []

    scroll_down(driver, 3)
    time.sleep(1)

    page_num = 1
    while len(results) < max_results:
        soup = soup_of(driver)
        items = soup.select(".issue-item")

        if not items:
            break

        for item in items:
            if len(results) >= max_results:
                break

            # Título
            title_el = item.select_one(".issue-item__title a")
            title = title_el.get_text(strip=True) if title_el else ""
            if not title:
                continue

            href = title_el.get("href", "") if title_el else ""
            art_url = urljoin("https://dl.acm.org", href)

            # DOI — está na URL: /doi/10.xxxx/...
            doi = ""
            m = re.search(r"/doi/(10\.\S+)", href)
            if m:
                doi = m.group(1)

            # Autores
            authors = [
                a.get_text(strip=True)
                for a in item.select(".authors__name, .issue-item__authors a")
            ]

            # Abstract
            abs_el = item.select_one(".issue-item__abstract p")
            abstract = abs_el.get_text(strip=True) if abs_el else ""

            # Venue / journal
            venue_el = item.select_one(".issue-item__detail a, .bookPubDate")
            journal = venue_el.get_text(strip=True) if venue_el else ""

            # Ano
            year = None
            date_el = item.select_one(".bookPubDate, .issue-item__detail span")
            if date_el:
                m2 = re.search(r"\b(20\d{2}|19\d{2})\b", date_el.get_text())
                if m2:
                    year = int(m2.group(1))

            # PDF (open access)
            pdf_url = ""
            pdf_el = item.select_one("a[href*='/doi/pdf/'], a.btn--pdf")
            if pdf_el:
                pdf_url = urljoin("https://dl.acm.org", pdf_el.get("href", ""))

            oa = bool(item.select_one(".issue-item__open-access, .open-access"))

            results.append(make_article(
                source="acm",
                title=title,
                authors=authors,
                abstract=abstract,
                doi=doi,
                url=art_url,
                pdf_url=pdf_url,
                year=year,
                journal=journal,
                open_access=oa,
            ))

        # Próxima página
        if len(results) >= max_results:
            break

        try:
            next_btn = driver.find_element(
                By.CSS_SELECTOR,
                "a[aria-label='Next Page']:not([aria-disabled='true']), "
                ".pagination__btn--next:not(.disabled)"
            )
            driver.execute_script("arguments[0].click();", next_btn)
            page_num += 1
            human_delay(exec_cfg["delay_min"] + 1, exec_cfg["delay_max"] + 2)
            scroll_down(driver, 3)
        except NoSuchElementException:
            break

    return results


# ──────────────────────────────────────────────────────────────────────────────
# Source: Springer
# ──────────────────────────────────────────────────────────────────────────────

def scrape_springer(driver: webdriver.Chrome, query: str, cfg: dict,
                    max_results: int, exec_cfg: dict) -> list[dict]:
    results = []
    start_year = cfg.get("start_year", 0)
    discipline = cfg.get("discipline", "")

    q = quote_plus(query)
    url = f"https://link.springer.com/search?query={q}&search-within=Journal"
    if start_year:
        url += f"&dateFrom={start_year}"
    if discipline:
        url += f"&facet-discipline=%22{quote_plus(discipline)}%22"

    console.print(f"    [dim]Springer: {url[:80]}[/]")

    try:
        driver.get(url)
    except Exception as e:
        console.print(f"    [red]Springer load error: {e}[/]")
        return []

    if not wait_for(driver, ".c-card, .result-item", timeout=15):
        console.print("    [yellow]Springer: timeout[/]")
        return []

    scroll_down(driver, 3)

    page_num = 1
    while len(results) < max_results:
        soup = soup_of(driver)
        items = soup.select(".c-card")

        if not items:
            break

        for item in items:
            if len(results) >= max_results:
                break

            title_el = item.select_one(".c-card__title a, h2 a")
            title = title_el.get_text(strip=True) if title_el else ""
            if not title:
                continue

            href = title_el.get("href", "") if title_el else ""
            art_url = urljoin("https://link.springer.com", href)

            # DOI
            doi = ""
            m = re.search(r"/(10\.\d{4,}/\S+)", href)
            if m:
                doi = m.group(1)

            authors = [
                a.get_text(strip=True)
                for a in item.select(".c-author-list a, .authors a")
            ]

            abs_el = item.select_one(".c-card__description, .abstract-text")
            abstract = abs_el.get_text(strip=True) if abs_el else ""

            journal_el = item.select_one(".c-card__journal-title, .publication-title")
            journal = journal_el.get_text(strip=True) if journal_el else ""

            year = None
            date_el = item.select_one(".c-card__published-date, time")
            if date_el:
                m2 = re.search(r"\b(20\d{2}|19\d{2})\b", date_el.get_text())
                if m2:
                    year = int(m2.group(1))

            pdf_url = ""
            pdf_el = item.select_one("a[href$='.pdf'], a.c-pdf-download__link")
            if pdf_el:
                pdf_url = urljoin("https://link.springer.com", pdf_el.get("href", ""))

            oa = bool(item.select_one(".c-card__open-access, [aria-label*='Open Access']"))

            results.append(make_article(
                source="springer",
                title=title,
                authors=authors,
                abstract=abstract,
                doi=doi,
                url=art_url,
                pdf_url=pdf_url,
                year=year,
                journal=journal,
                open_access=oa,
            ))

        if len(results) >= max_results:
            break

        try:
            next_btn = driver.find_element(
                By.CSS_SELECTOR,
                "a[data-track-action='next page'], a[rel='next']"
            )
            driver.execute_script("arguments[0].click();", next_btn)
            page_num += 1
            human_delay(exec_cfg["delay_min"], exec_cfg["delay_max"])
            scroll_down(driver, 3)
        except NoSuchElementException:
            break

    return results


# ──────────────────────────────────────────────────────────────────────────────
# Source: Portal CAPES
# ──────────────────────────────────────────────────────────────────────────────

def scrape_capes(driver: webdriver.Chrome, query: str, cfg: dict,
                 max_results: int, exec_cfg: dict) -> list[dict]:
    results = []
    start_year = cfg.get("start_year", 0)

    url = "https://www.periodicos.capes.gov.br"
    console.print(f"    [dim]CAPES: abrindo portal... (VPN necessária)[/]")

    try:
        driver.get(url)
    except Exception as e:
        console.print(f"    [red]CAPES load error: {e}[/]")
        return []

    time.sleep(4)

    # Busca pela caixa de pesquisa
    try:
        search_box = WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR,
                "input[type='search'], input[placeholder*='Buscar'], #searchInput, .search-input"))
        )
        search_box.clear()
        search_box.send_keys(query)
        time.sleep(0.5)
        search_box.send_keys(Keys.RETURN)
    except TimeoutException:
        console.print("    [red]CAPES: campo de busca não encontrado[/]")
        return []

    time.sleep(4)
    if not wait_for(driver, ".resultado, .result-item, .periodico-card, article", timeout=20):
        console.print("    [yellow]CAPES: sem resultados visíveis[/]")
        return []

    scroll_down(driver, 4)
    soup = soup_of(driver)

    cards = (soup.select(".resultado") or soup.select(".result-item") or
             soup.select(".periodico-card") or soup.select("article"))

    for card in cards[:max_results]:
        title_el = card.select_one("h2, h3, .title, .titulo, a")
        title = title_el.get_text(strip=True) if title_el else ""
        if not title:
            continue

        link_el = card.select_one("a[href]")
        art_url = ""
        if link_el:
            art_url = urljoin(url, link_el["href"])

        abs_el = card.select_one("p, .abstract, .descricao")
        abstract = abs_el.get_text(strip=True) if abs_el else ""

        year = None
        m = re.search(r"\b(20\d{2}|19\d{2})\b", card.get_text())
        if m:
            year = int(m.group(1))

        results.append(make_article(
            source="capes",
            title=title,
            authors=[],
            abstract=abstract,
            url=art_url,
            year=year,
        ))

    return results


# ──────────────────────────────────────────────────────────────────────────────
# Storage helpers
# ──────────────────────────────────────────────────────────────────────────────

def sanitize_filename(value: str, fallback: str = "untitled", limit: int = 80) -> str:
    cleaned = re.sub(r'[\\/*?:"<>|]', "_", (value or "").strip())
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    return (cleaned or fallback)[:limit]


def article_json_path(article: dict, metadata_dir: Path) -> Path:
    return metadata_dir / f"{sanitize_filename(article['id'])}.json"


def article_pdf_path(article: dict, downloads_dir: Path) -> Path:
    base_name = article.get("doi", "") or article.get("title", "") or article["id"]
    return downloads_dir / f"{sanitize_filename(base_name)}.pdf"


def is_unwanted_article_url(url: str) -> bool:
    if not url or not url.startswith("http"):
        return True
    host = urlparse(url).netloc.lower()
    return host in UNWANTED_ARTICLE_HOSTS


def is_trusted_article_url(url: str) -> bool:
    if not url or not url.startswith("http"):
        return False
    host = urlparse(url).netloc.lower()
    if host in UNWANTED_ARTICLE_HOSTS:
        return False
    return any(host == suffix or host.endswith(f".{suffix}") for suffix in TRUSTED_ARTICLE_HOST_SUFFIXES)


def sanitize_article_links(article: dict) -> dict | None:
    cleaned = dict(article)
    article_url = cleaned.get("url", "").strip()
    pdf_url = cleaned.get("pdf_url", "").strip()

    if article_url and not is_trusted_article_url(article_url):
        cleaned["url"] = ""
    if pdf_url and not is_trusted_article_url(pdf_url):
        cleaned["pdf_url"] = ""
        cleaned["open_access"] = False

    if cleaned.get("url") or cleaned.get("pdf_url") or cleaned.get("doi"):
        return cleaned
    return None


class MongoArticleStore:
    def __init__(self, cfg: dict):
        mongo_cfg = cfg.get("mongodb", {})
        self.enabled = bool(mongo_cfg.get("enabled", True))
        self.uri = (mongo_cfg.get("uri") or DEFAULT_MONGODB_URI).strip()
        self.db_name = mongo_cfg.get("database", "ragflow")
        self.collection_name = mongo_cfg.get("collection", "scraped_articles")
        self.fs_collection = mongo_cfg.get("gridfs_collection", "scraped_article_files")
        self.client: MongoClient | None = None
        self.collection = None
        self.fs: GridFS | None = None

        if not self.enabled:
            return

        self.client = MongoClient(self.uri, serverSelectionTimeoutMS=5000)
        db = self.client[self.db_name]
        self.collection = db[self.collection_name]
        self.fs = GridFS(db, collection=self.fs_collection)
        self.collection.create_index("id", unique=True)
        self.collection.create_index("doi", sparse=True)
        self.collection.create_index("source")

    def close(self) -> None:
        if self.client is not None:
            self.client.close()

    def get_article(self, article_id: str) -> dict | None:
        if self.collection is None:
            return None
        return self.collection.find_one({"id": article_id})

    def article_exists(self, article_id: str) -> bool:
        if self.collection is None:
            return False
        return self.collection.count_documents({"id": article_id}, limit=1) > 0

    def load_existing_ids(self) -> set[str]:
        if self.collection is None:
            return set()
        return {doc["id"] for doc in self.collection.find({}, {"id": 1, "_id": 0}) if doc.get("id")}

    def upsert_article(self, article: dict) -> None:
        if self.collection is None:
            return
        payload = dict(article)
        payload["updated_at"] = datetime.now(timezone.utc).isoformat()
        self.collection.update_one(
            {"id": article["id"]},
            {"$set": payload, "$setOnInsert": {"created_at": payload["updated_at"]}},
            upsert=True,
        )

    def store_pdf_bytes(self, article: dict, filename: str, content: bytes) -> str | None:
        if self.fs is None or self.collection is None:
            return None

        sha1 = hashlib.sha1(content).hexdigest()
        existing = self.get_article(article["id"]) or {}
        if existing.get("pdf_sha1") == sha1 and existing.get("pdf_gridfs_id"):
            return str(existing["pdf_gridfs_id"])

        if existing.get("pdf_gridfs_id"):
            try:
                self.fs.delete(existing["pdf_gridfs_id"])
            except Exception:
                pass

        file_id = self.fs.put(
            content,
            filename=filename,
            contentType="application/pdf",
            article_id=article["id"],
            title=article.get("title", ""),
            doi=article.get("doi", ""),
            source=article.get("source", ""),
            downloaded_at=datetime.now(timezone.utc).isoformat(),
        )
        self.collection.update_one(
            {"id": article["id"]},
            {
                "$set": {
                    "pdf_gridfs_id": file_id,
                    "pdf_sha1": sha1,
                    "pdf_size": len(content),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
            upsert=True,
        )
        return str(file_id)

    def register_pdf_from_path(self, article: dict, path: Path) -> str | None:
        if not path.exists():
            return None
        return self.store_pdf_bytes(article, path.name, path.read_bytes())


# ──────────────────────────────────────────────────────────────────────────────
# PDF download
# ──────────────────────────────────────────────────────────────────────────────

def download_pdf(
    article: dict,
    downloads_dir: Path,
    timeout: int = 40,
    mongo_store: MongoArticleStore | None = None,
) -> str | None:
    pdf_url = article.get("pdf_url", "")
    if not pdf_url or not pdf_url.startswith("http"):
        return None

    # 1. Metadata já registrou um caminho local válido?
    existing_local = article.get("pdf_local", "")
    if existing_local and Path(existing_local).exists():
        if mongo_store:
            mongo_store.register_pdf_from_path(article, Path(existing_local))
        console.print(f"    [dim]↓ já existe (pdf_local): {Path(existing_local).name}[/]")
        return existing_local

    # 1.1 MongoDB já registrou um caminho local válido?
    if mongo_store:
        existing_article = mongo_store.get_article(article["id"])
        if existing_article:
            mongo_pdf_local = existing_article.get("pdf_local", "")
            if mongo_pdf_local and Path(mongo_pdf_local).exists():
                console.print(f"    [dim]↓ já existe (mongo): {Path(mongo_pdf_local).name}[/]")
                return mongo_pdf_local

    # 2. Arquivo já existe no disco pelo nome derivado?
    dest = article_pdf_path(article, downloads_dir)
    if dest.exists():
        if mongo_store:
            mongo_store.register_pdf_from_path(article, dest)
        console.print(f"    [dim]↓ já existe (arquivo): {dest.name}[/]")
        return str(dest)

    try:
        r = requests.get(pdf_url, timeout=timeout, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0",
            "Accept": "application/pdf,*/*",
        }, stream=True, allow_redirects=True)
        if r.status_code == 200:
            content = b"".join(r.iter_content(8192))
            if b"%PDF" in content[:32]:
                dest.write_bytes(content)
                if mongo_store:
                    mongo_store.store_pdf_bytes(article, dest.name, content)
                return str(dest)
            else:
                console.print(f"[dim]PDF inválido (HTML?): {pdf_url[:80]}[/]")
        else:
            console.print(f"[dim]Download falhou HTTP {r.status_code}: {pdf_url[:80]}[/]")
    except Exception as e:
        console.print(f"[dim]Erro ao baixar PDF: {e} — {pdf_url[:80]}[/]")
    return None


# ──────────────────────────────────────────────────────────────────────────────
# Persistence
# ──────────────────────────────────────────────────────────────────────────────

def load_existing_ids(metadata_dir: Path, mongo_store: MongoArticleStore | None = None) -> set[str]:
    ids: set[str] = set()
    for f in metadata_dir.glob("*.json"):
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
            if "id" in d:
                ids.add(d["id"])
        except Exception:
            pass
    if mongo_store:
        ids |= mongo_store.load_existing_ids()
    return ids


def save_article(article: dict, metadata_dir: Path, mongo_store: MongoArticleStore | None = None) -> None:
    path = article_json_path(article, metadata_dir)
    path.write_text(json.dumps(article, ensure_ascii=False, indent=2), encoding="utf-8")
    if mongo_store:
        mongo_store.upsert_article(article)


def save_report(articles: list[dict], reports_dir: Path, run_id: str) -> None:
    jpath = reports_dir / f"run_{run_id}.json"
    jpath.write_text(json.dumps(articles, ensure_ascii=False, indent=2), encoding="utf-8")

    cpath = reports_dir / f"run_{run_id}.csv"
    fields = ["id","source","title","authors","year","journal","doi","url",
              "pdf_url","open_access","citation_count","fetched_at"]
    with cpath.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for a in articles:
            row = {**a, "authors": "; ".join(a.get("authors", []))}
            w.writerow(row)

    console.print(f"[green]Relatório:[/] {jpath.name}  +  {cpath.name}")


def deduplicate(articles: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for a in articles:
        if a["id"] not in seen:
            seen.add(a["id"])
            out.append(a)
    return out


# ──────────────────────────────────────────────────────────────────────────────
# Source: ScienceDirect (Elsevier)
# ──────────────────────────────────────────────────────────────────────────────

def scrape_sciencedirect(driver: webdriver.Chrome, query: str, cfg: dict,
                         max_results: int, exec_cfg: dict) -> list[dict]:
    results = []
    start_year = cfg.get("start_year", 0)

    q = quote_plus(query)
    url = f"https://www.sciencedirect.com/search?qs={q}"
    if start_year:
        url += f"&date={start_year}-2025"

    console.print(f"    [dim]ScienceDirect: {url[:80]}[/]")

    try:
        driver.get(url)
    except Exception as e:
        console.print(f"    [red]ScienceDirect load error: {e}[/]")
        return []

    if not wait_for(driver, ".result-item-content, .ResultItem, article.search-result-item", timeout=20):
        console.print("    [yellow]ScienceDirect: timeout aguardando resultados[/]")
        return []

    time.sleep(2)
    scroll_down(driver, 4)

    page_num = 1
    while len(results) < max_results:
        soup = soup_of(driver)
        items = (soup.select(".result-item-content") or
                 soup.select(".ResultItem") or
                 soup.select("article.search-result-item"))

        if not items:
            break

        for item in items:
            if len(results) >= max_results:
                break

            title_el = item.select_one("h2 a, .result-list-title-link, [class*='title'] a")
            title = title_el.get_text(strip=True) if title_el else ""
            if not title:
                continue

            href = title_el.get("href", "") if title_el else ""
            art_url = urljoin("https://www.sciencedirect.com", href)

            # DOI — geralmente na URL: /science/article/pii/... ou /doi/...
            doi = ""
            doi_m = re.search(r"/doi/(10\.\S+)", href)
            if doi_m:
                doi = doi_m.group(1)

            authors = [
                a.get_text(strip=True)
                for a in item.select(".author, .Authors a, [class*='author'] span")
            ]

            abs_el = item.select_one(".abstract, .result-item-description, [class*='abstract']")
            abstract = abs_el.get_text(strip=True) if abs_el else ""

            journal_el = item.select_one(".srctitle-date-fields a, [class*='journal'], .publication-title")
            journal = journal_el.get_text(strip=True) if journal_el else ""

            year = None
            date_el = item.select_one(".srctitle-date-fields, .date, time")
            if date_el:
                m = re.search(r"\b(20\d{2}|19\d{2})\b", date_el.get_text())
                if m:
                    year = int(m.group(1))

            # PDF open access
            pdf_url = ""
            oa = bool(item.select_one(".open-archive, .open-access, [class*='openAccess']"))
            if oa:
                pdf_url = art_url  # PDF disponível via DOI redirect

            results.append(make_article(
                source="sciencedirect",
                title=title,
                authors=authors,
                abstract=abstract,
                doi=doi,
                url=art_url,
                pdf_url=pdf_url,
                year=year,
                journal=journal,
                open_access=oa,
            ))

        if len(results) >= max_results:
            break

        try:
            next_btn = driver.find_element(
                By.CSS_SELECTOR,
                "li.next-link a, button[aria-label='Next page']:not([disabled])"
            )
            driver.execute_script("arguments[0].click();", next_btn)
            page_num += 1
            human_delay(exec_cfg["delay_min"] + 1, exec_cfg["delay_max"] + 2)
            scroll_down(driver, 3)
        except NoSuchElementException:
            break

    return results


# ──────────────────────────────────────────────────────────────────────────────
# Source: CORE (open access aggregator)
# ──────────────────────────────────────────────────────────────────────────────

def scrape_core(driver: webdriver.Chrome, query: str, cfg: dict,
                max_results: int, exec_cfg: dict) -> list[dict]:
    results = []
    start_year = cfg.get("start_year", 0)

    q = quote_plus(query)
    url = f"https://core.ac.uk/search?q={q}"
    if start_year:
        url += f"&yearFrom={start_year}"

    console.print(f"    [dim]CORE: {url[:80]}[/]")

    try:
        driver.get(url)
    except Exception as e:
        console.print(f"    [red]CORE load error: {e}[/]")
        return []

    if not wait_for(driver, ".paper, .result, article[class*='paper']", timeout=20):
        console.print("    [yellow]CORE: timeout aguardando resultados[/]")
        return []

    time.sleep(2)
    scroll_down(driver, 4)

    page_num = 1
    while len(results) < max_results:
        soup = soup_of(driver)
        items = soup.select(".paper") or soup.select("article[class*='paper']")

        if not items:
            break

        for item in items:
            if len(results) >= max_results:
                break

            title_el = item.select_one("h3 a, h2 a, .paper-title a, [class*='title'] a")
            title = title_el.get_text(strip=True) if title_el else ""
            if not title:
                continue

            href = title_el.get("href", "") if title_el else ""
            art_url = urljoin("https://core.ac.uk", href) if href else ""

            authors = [
                a.get_text(strip=True)
                for a in item.select(".authors a, [class*='author']")
            ]

            abs_el = item.select_one(".abstract, p[class*='abstract'], [class*='description']")
            abstract = abs_el.get_text(strip=True) if abs_el else ""

            year = None
            date_el = item.select_one("[class*='year'], [class*='date'], time")
            if date_el:
                m = re.search(r"\b(20\d{2}|19\d{2})\b", date_el.get_text())
                if m:
                    year = int(m.group(1))

            # CORE é sempre open access
            pdf_url = ""
            pdf_el = item.select_one("a[href$='.pdf'], a[class*='pdf'], a[class*='download']")
            if pdf_el:
                pdf_url = urljoin("https://core.ac.uk", pdf_el.get("href", ""))
            elif art_url:
                pdf_url = art_url.replace("/works/", "/outputs/") + "/download"

            results.append(make_article(
                source="core",
                title=title,
                authors=authors,
                abstract=abstract,
                url=art_url,
                pdf_url=pdf_url,
                year=year,
                open_access=True,  # CORE só indexa open access
            ))

        if len(results) >= max_results:
            break

        try:
            next_btn = driver.find_element(
                By.CSS_SELECTOR,
                "button[aria-label='Next page']:not([disabled]), a[aria-label='Next']:not(.disabled)"
            )
            driver.execute_script("arguments[0].click();", next_btn)
            page_num += 1
            human_delay(exec_cfg["delay_min"], exec_cfg["delay_max"])
            scroll_down(driver, 3)
        except NoSuchElementException:
            break

    return results


# ──────────────────────────────────────────────────────────────────────────────
# Source: DBLP (Computer Science Bibliography)
# ──────────────────────────────────────────────────────────────────────────────

def scrape_dblp(driver: webdriver.Chrome, query: str, cfg: dict,
                max_results: int, exec_cfg: dict) -> list[dict]:
    del exec_cfg  # uniform signature, unused in this source
    results = []
    start_year = cfg.get("start_year", 0)

    q = quote_plus(query)
    url = f"https://dblp.org/search?q={q}"

    console.print(f"    [dim]DBLP: {url[:80]}[/]")

    try:
        driver.get(url)
    except Exception as e:
        console.print(f"    [red]DBLP load error: {e}[/]")
        return []

    if not wait_for(driver, "ul#completesearch-pubres-tbody li, .publ-list li", timeout=15):
        console.print("    [yellow]DBLP: timeout aguardando resultados[/]")
        return []

    time.sleep(1)
    scroll_down(driver, 3)

    # DBLP carrega resultados via XHR — pega do HTML renderizado
    soup = soup_of(driver)
    items = soup.select("ul#completesearch-pubres-tbody li") or soup.select(".publ-list li.inproceedings, .publ-list li.article")

    for item in items[:max_results]:
        title_el = item.select_one("span.title, .title")
        title = title_el.get_text(strip=True) if title_el else ""
        if not title or title == "...":
            continue

        # Ano
        year = None
        year_el = item.select_one("span[itemprop='datePublished'], .year")
        if year_el:
            m = re.search(r"\b(20\d{2}|19\d{2})\b", year_el.get_text())
            if m:
                year = int(m.group(1))

        if start_year and year and year < start_year:
            continue

        authors = [
            a.get_text(strip=True)
            for a in item.select("span[itemprop='author'] span[itemprop='name'], .authors a")
        ]

        # Venue/journal
        venue_el = item.select_one("span[itemprop='isPartOf'] span[itemprop='name'], .venue")
        journal = venue_el.get_text(strip=True) if venue_el else ""

        # Links
        art_url = ""
        pdf_url = ""
        doi = ""
        for a in item.select("nav.publ li a, .publ-list a"):
            href = a.get("href", "")
            text = a.get_text(strip=True).lower()
            # Match only URLs that ARE a doi.org link (not social-share URLs that
            # contain doi.org as an encoded query parameter).
            doi_m = re.match(r"https?://(?:dx\.)?doi\.org/(10\.\S+)", href)
            if doi_m and not doi:
                doi = doi_m.group(1)
            if not art_url and href.startswith("http") and not is_unwanted_article_url(href):
                art_url = href
            if ("pdf" in text or href.endswith(".pdf")) and (
                "arxiv.org" in href or href.endswith(".pdf")
            ):
                pdf_url = re.sub(r"arxiv\.org/abs/", "arxiv.org/pdf/", href)

        results.append(make_article(
            source="dblp",
            title=title,
            authors=authors,
            doi=doi,
            url=art_url,
            pdf_url=pdf_url,
            year=year,
            journal=journal,
        ))

    return results


# ──────────────────────────────────────────────────────────────────────────────
# Source: Papers With Code (ML/AI focused)
# ──────────────────────────────────────────────────────────────────────────────

def scrape_paperswithcode(driver: webdriver.Chrome, query: str, cfg: dict,
                           max_results: int, exec_cfg: dict) -> list[dict]:
    del exec_cfg  # uniform signature, unused in this source
    results = []
    start_year = cfg.get("start_year", 0)

    q = quote_plus(query)
    url = f"https://paperswithcode.com/search?q_meta=&q_type=&q={q}"

    console.print(f"    [dim]PapersWithCode: {url[:80]}[/]")

    try:
        driver.get(url)
    except Exception as e:
        console.print(f"    [red]PapersWithCode load error: {e}[/]")
        return []

    if not wait_for(driver, ".paper-card, .infinite-results .row", timeout=15):
        console.print("    [yellow]PapersWithCode: timeout aguardando resultados[/]")
        return []

    time.sleep(1)

    # Scroll para carregar mais resultados (infinite scroll)
    loaded = 0
    while loaded < max_results:
        scroll_down(driver, 3)
        time.sleep(1.2)
        soup = soup_of(driver)
        items = soup.select(".paper-card")
        if len(items) >= max_results or len(items) == loaded:
            break
        loaded = len(items)

    soup = soup_of(driver)
    items = soup.select(".paper-card")

    for item in items[:max_results]:
        title_el = item.select_one("h1 a, h2 a, .item-strip-header a")
        title = title_el.get_text(strip=True) if title_el else ""
        if not title:
            continue

        href = title_el.get("href", "") if title_el else ""
        art_url = urljoin("https://paperswithcode.com", href)

        abs_el = item.select_one(".item-strip-abstract, p.card-text")
        abstract = abs_el.get_text(strip=True) if abs_el else ""

        # Ano
        year = None
        date_el = item.select_one(".author-name-text, .item-strip-details")
        if date_el:
            m = re.search(r"\b(20\d{2}|19\d{2})\b", date_el.get_text())
            if m:
                year = int(m.group(1))

        if start_year and year and year < start_year:
            continue

        # arXiv link (open access)
        pdf_url = ""
        arxiv_el = item.select_one("a[href*='arxiv.org']")
        if arxiv_el:
            arxiv_href = arxiv_el.get("href", "")
            # Converte /abs/ para /pdf/
            pdf_url = re.sub(r"arxiv\.org/abs/", "arxiv.org/pdf/", arxiv_href)

        # Estrelas GitHub como proxy de relevância
        stars = None
        stars_el = item.select_one(".entity-stars span, .github-badge")
        if stars_el:
            m = re.search(r"[\d,]+", stars_el.get_text())
            if m:
                stars = int(m.group().replace(",", ""))

        results.append(make_article(
            source="paperswithcode",
            title=title,
            authors=[],
            abstract=abstract,
            url=art_url,
            pdf_url=pdf_url,
            year=year,
            open_access=bool(pdf_url),
            citation_count=stars,  # usamos stars como proxy
        ))

    return results


# ──────────────────────────────────────────────────────────────────────────────
# Dispatcher
# ──────────────────────────────────────────────────────────────────────────────

SOURCE_FN = {
    "arxiv":            scrape_arxiv,
    "ieee":             scrape_ieee,
    "semantic_scholar": scrape_semantic_scholar,
    "acm":              scrape_acm,
    "springer":         scrape_springer,
    "sciencedirect":    scrape_sciencedirect,
    "core":             scrape_core,
    "dblp":             scrape_dblp,
    "paperswithcode":   scrape_paperswithcode,
    "capes":            scrape_capes,
}


def print_table(articles: list[dict]) -> None:
    t = Table(title=f"Coletados ({len(articles)})", header_style="bold cyan", show_lines=False)
    t.add_column("Fonte",  style="dim",  width=16)
    t.add_column("Título",              width=62, no_wrap=True)
    t.add_column("Ano",   justify="right", width=5)
    t.add_column("OA",    justify="center", width=4)
    t.add_column("Cit.",  justify="right", width=6)
    for a in articles[:50]:
        t.add_row(
            a["source"], a["title"][:62],
            str(a.get("year") or ""),
            "✓" if a.get("open_access") else "",
            str(a.get("citation_count") or ""),
        )
    if len(articles) > 50:
        t.add_row("[dim]…[/]", f"[dim]+{len(articles)-50} mais[/]", "", "", "")
    console.print(t)


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────

def load_config(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def setup_dirs(cfg: dict) -> tuple[Path, Path, Path, Path, Path]:
    base    = Path(cfg["output"]["base_dir"])
    meta    = base / cfg["output"]["metadata_dir"]
    dl      = base / cfg["output"]["downloads_dir"]
    rep     = base / cfg["output"]["reports_dir"]
    shots   = base / cfg["output"].get("screenshots_dir", "screenshots")
    for d in (meta, dl, rep, shots):
        d.mkdir(parents=True, exist_ok=True)
    return base, meta, dl, rep, shots


def resolve_enabled_sources(cfg: dict, args: argparse.Namespace) -> list[str]:
    sources_cfg = cfg.get("sources", {})
    if args.sources:
        return args.sources
    return [s for s, c in sources_cfg.items() if c.get("enabled", False)]


def resolve_queries(cfg: dict, args: argparse.Namespace) -> list[dict]:
    if args.query:
        return [{"query": args.query, "max_results": args.max or 30}]
    return cfg.get("queries", [])


def maybe_create_mongo_store(cfg: dict) -> MongoArticleStore | None:
    mongo_cfg = cfg.get("mongodb", {})
    if not mongo_cfg.get("enabled", True):
        return None
    try:
        store = MongoArticleStore(cfg)
        if store.client is not None:
            store.client.admin.command({"ping": 1})
        return store
    except Exception as err:
        console.print(f"[yellow]MongoDB indisponível, seguindo sem persistência no banco: {err}[/]")
        return None


def build_kafka_producer(cfg: dict) -> tuple[KafkaProducer, str]:
    kafka_cfg = cfg.get("kafka", {})
    bootstrap_servers = kafka_cfg.get("bootstrap_servers") or DEFAULT_KAFKA_BOOTSTRAP
    topic = kafka_cfg.get("topic") or DEFAULT_KAFKA_TOPIC
    producer = KafkaProducer(
        bootstrap_servers=bootstrap_servers,
        value_serializer=lambda value: json.dumps(value, ensure_ascii=False).encode("utf-8"),
        key_serializer=lambda value: value.encode("utf-8"),
        linger_ms=int(kafka_cfg.get("linger_ms", 100)),
        retries=int(kafka_cfg.get("retries", 5)),
        acks=kafka_cfg.get("acks", "all"),
    )
    return producer, topic


def scrape_articles(
    driver: webdriver.Chrome,
    cfg: dict,
    args: argparse.Namespace,
    metadata_dir: Path,
    downloads_dir: Path,
    reports_dir: Path,
    screenshots_dir: Path,
    mongo_store: MongoArticleStore | None = None,
    publish_article: Callable[[dict], None] | None = None,
    persist_before_publish: bool = True,
    download_pdfs: bool = True,
) -> tuple[list[dict], int, int]:
    browser_cfg = cfg.get("browser", {})
    exec_cfg = cfg.get("execution", {})
    exec_cfg.setdefault("delay_min", 1.5)
    exec_cfg.setdefault("delay_max", 3.5)
    exec_cfg.setdefault("delay_between_queries", 5)
    exec_cfg.setdefault("skip_existing", True)
    exec_cfg.setdefault("min_year", 0)
    exec_cfg.setdefault("max_total_articles", 0)
    exec_cfg.setdefault("screenshot_on_error", True)

    dl_cfg = cfg.get("downloads", {})
    do_download = download_pdfs and dl_cfg.get("enabled", True) and not args.no_download
    oa_only = dl_cfg.get("open_access_only", True)
    dl_timeout = int(dl_cfg.get("timeout", 40))
    max_dl = int(dl_cfg.get("max_total", 0))

    sources_cfg = cfg.get("sources", {})
    enabled = resolve_enabled_sources(cfg, args)
    queries = resolve_queries(cfg, args)

    if not queries:
        console.print("[red]Nenhuma query configurada.[/]")
        sys.exit(1)

    existing_ids = load_existing_ids(metadata_dir, mongo_store) if exec_cfg["skip_existing"] else set()
    if existing_ids:
        console.print(f"[dim]{len(existing_ids)} artigos existentes — serão pulados[/]\n")

    all_collected: list[dict] = []
    total_new = 0
    total_dl = 0
    max_total = int(exec_cfg["max_total_articles"])
    min_year = int(exec_cfg["min_year"])

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TextColumn("{task.completed}/{task.total}"),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("Queries", total=len(queries))

        for q_item in queries:
            if max_total and total_new >= max_total:
                break

            q_text = q_item.get("query", "")
            q_max = args.max or q_item.get("max_results", 20)
            progress.update(task, description=f"[cyan]{q_text[:55]}…")
            console.print(f"\n[bold]Query:[/] {q_text}")

            for source_name in enabled:
                if max_total and total_new >= max_total:
                    break

                src_cfg = sources_cfg.get(source_name, {})
                if not src_cfg.get("enabled", True):
                    continue

                fn = SOURCE_FN.get(source_name)
                if not fn:
                    continue

                limit = min(q_max, src_cfg.get("max_per_query", q_max))
                console.print(f"  [dim]→[/] [bold]{source_name}[/] (max {limit})")

                try:
                    found = fn(driver, q_text, src_cfg, limit, exec_cfg)
                except Exception as e:
                    console.print(f"    [red]✗ Erro: {e}[/]")
                    if exec_cfg["screenshot_on_error"]:
                        screenshot_on_error(driver, source_name, screenshots_dir)
                    human_delay(2, 4)
                    continue

                found = deduplicate(found)
                trusted_found: list[dict] = []
                discarded_untrusted = 0
                for article in found:
                    sanitized = sanitize_article_links(article)
                    if sanitized is None:
                        discarded_untrusted += 1
                        continue
                    trusted_found.append(sanitized)
                found = trusted_found
                if min_year:
                    found = [a for a in found if (a.get("year") or 0) >= min_year]

                new = [a for a in found if a["id"] not in existing_ids]
                console.print(
                    f"    [green]✓[/] {len(found)} confiáveis, {len(new)} novos"
                    + (f", {discarded_untrusted} descartados por host" if discarded_untrusted else "")
                )

                for article in new:
                    if persist_before_publish:
                        save_article(article, metadata_dir, mongo_store)
                    if publish_article:
                        publish_article(article)
                    if not persist_before_publish:
                        save_article(article, metadata_dir, mongo_store)

                    existing_ids.add(article["id"])
                    all_collected.append(article)
                    total_new += 1

                    if do_download and (not oa_only or article.get("open_access")):
                        if not max_dl or total_dl < max_dl:
                            dest = download_pdf(article, downloads_dir, dl_timeout, mongo_store)
                            if dest:
                                article["pdf_local"] = dest
                                save_article(article, metadata_dir, mongo_store)
                                total_dl += 1
                                console.print(f"    [green]↓[/] {Path(dest).name}")

                human_delay(exec_cfg["delay_min"], exec_cfg["delay_max"])

            progress.advance(task)
            time.sleep(exec_cfg["delay_between_queries"])

    return all_collected, total_new, total_dl


def main() -> None:
    parser = argparse.ArgumentParser(description="Article Scraper — Selenium")
    parser.add_argument("--config",   default="config.yaml")
    parser.add_argument("--query",    default="", help="Query avulsa")
    parser.add_argument("--sources",  nargs="+",  help="Fontes a usar")
    parser.add_argument("--max",      type=int, default=0)
    parser.add_argument("--mode",     choices=("producer", "direct"), default="", help="producer = publica no Kafka; direct = baixa PDFs no mesmo processo")
    parser.add_argument("--headless", default="", help="true/false (override config)")
    parser.add_argument("--no-download", action="store_true")
    parser.add_argument("--list-existing", action="store_true")
    args = parser.parse_args()

    config_path = Path(args.config)
    if not config_path.exists():
        config_path = Path(__file__).parent / args.config
    if not config_path.exists():
        console.print(f"[red]Config não encontrado: {args.config}[/]")
        sys.exit(1)

    cfg = load_config(str(config_path))
    base_dir, metadata_dir, downloads_dir, reports_dir, screenshots_dir = setup_dirs(cfg)
    mongo_store = maybe_create_mongo_store(cfg)

    if args.list_existing:
        ids = load_existing_ids(metadata_dir, mongo_store)
        console.print(f"[cyan]{len(ids)} artigos coletados em {metadata_dir}[/]")
        for uid in sorted(ids)[:60]:
            console.print(f"  {uid}")
        return

    # Config derivada
    browser_cfg = cfg.get("browser", {})
    if args.headless.lower() in ("true", "false"):
        browser_cfg["headless"] = args.headless.lower() == "true"

    enabled = resolve_enabled_sources(cfg, args)
    queries = resolve_queries(cfg, args)
    kafka_cfg = cfg.get("kafka", {})
    kafka_enabled = bool(kafka_cfg.get("enabled", False))
    run_mode = args.mode or ("producer" if kafka_enabled else "direct")

    if not queries:
        console.print("[red]Nenhuma query configurada.[/]")
        sys.exit(1)

    console.print(Panel.fit(
        f"[bold cyan]Article Scraper[/] — Selenium\n"
        f"Modo: [green]{run_mode}[/]\n"
        f"Fontes:  [green]{', '.join(enabled)}[/]\n"
        f"Queries: [yellow]{len(queries)}[/]  |  "
        f"Headless: {'sim' if browser_cfg.get('headless', True) else '[yellow]não[/]'}\n"
        f"Output:  [dim]{base_dir.resolve()}[/]",
        border_style="cyan",
    ))

    run_id = datetime.now().strftime("%Y%m%d_%H%M%S")

    # Inicia browser (único para toda a sessão)
    console.print("[dim]Iniciando Chrome...[/]")
    driver = build_driver(browser_cfg)
    producer: KafkaProducer | None = None
    topic = kafka_cfg.get("topic") or DEFAULT_KAFKA_TOPIC
    published = 0

    try:
        if run_mode == "producer":
            producer, topic = build_kafka_producer(cfg)

            def publish_article(article: dict) -> None:
                nonlocal published
                assert producer is not None
                producer.send(topic, key=article["id"], value=article)
                published += 1

            all_collected, total_new, total_dl = scrape_articles(
                driver,
                cfg,
                args,
                metadata_dir,
                downloads_dir,
                reports_dir,
                screenshots_dir,
                mongo_store=mongo_store,
                publish_article=publish_article,
                persist_before_publish=True,
                download_pdfs=False,
            )
            producer.flush()
        else:
            all_collected, total_new, total_dl = scrape_articles(
                driver,
                cfg,
                args,
                metadata_dir,
                downloads_dir,
                reports_dir,
                screenshots_dir,
                mongo_store=mongo_store,
                download_pdfs=True,
            )
    finally:
        driver.quit()
        if producer is not None:
            producer.close()
        if mongo_store:
            mongo_store.close()

    if all_collected:
        save_report(all_collected, reports_dir, run_id)

    if run_mode == "producer":
        console.print(Panel.fit(
            f"[bold green]Producer concluído![/]\n"
            f"Novos artigos:  [yellow]{total_new}[/]\n"
            f"Artigos publicados:  [yellow]{published}[/]\n"
            f"Kafka topic:  [dim]{topic}[/]\n"
            f"Metadados:  [dim]{metadata_dir.resolve()}[/]",
            border_style="green",
        ))
    else:
        console.print(Panel.fit(
            f"[bold green]Concluído![/]\n"
            f"Novos artigos:  [yellow]{total_new}[/]\n"
            f"PDFs baixados:  [yellow]{total_dl}[/]\n"
            f"Metadados:  [dim]{metadata_dir.resolve()}[/]\n"
            f"Downloads:  [dim]{downloads_dir.resolve()}[/]",
            border_style="green",
        ))

    if all_collected:
        print_table(all_collected)


if __name__ == "__main__":
    main()
