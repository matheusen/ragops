#!/usr/bin/env python3
"""
Batch PDF Downloader — relê os JSONs do metadata dir e baixa os PDFs ausentes.

Estratégia (em ordem):
  1. Se já tem pdf_url válida → tenta baixar direto.
  2. Se tem DOI mas não tem pdf_url → consulta Unpaywall API (grátis, sem chave)
     para encontrar versão open-access.
  3. Rate-limiting por domínio (arxiv ≥ 3s, outros ≥ 1s) e retry em 429.

Uso:
  python batch_download.py
  python batch_download.py --config config.yaml
  python batch_download.py --limit 200           # processa só N artigos
  python batch_download.py --sources arxiv semantic_scholar
  python batch_download.py --unpaywall-email seu@email.com
  python batch_download.py --dry-run             # mostra o que faria, sem baixar
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import requests
import yaml
from rich.console import Console
from rich.panel import Panel
from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn, TimeElapsedColumn
from rich.table import Table

# Importa helpers do scraper (mesmo diretório)
sys.path.insert(0, str(Path(__file__).parent))
from scraper import (
    MongoArticleStore,
    article_pdf_path,
    download_pdf,
    is_trusted_article_url,
    maybe_create_mongo_store,
    save_article,
    setup_dirs,
)

console = Console()

# Delays mínimos por host (segundos)
HOST_DELAYS: dict[str, float] = {
    "arxiv.org": 3.0,
    "export.arxiv.org": 3.0,
}
DEFAULT_DELAY = 1.0

# Últimas requisições por host (para rate-limiting)
_last_request: dict[str, float] = {}


def _wait_for_host(host: str) -> None:
    delay = HOST_DELAYS.get(host, DEFAULT_DELAY)
    last = _last_request.get(host, 0.0)
    wait = delay - (time.time() - last)
    if wait > 0:
        time.sleep(wait)
    _last_request[host] = time.time()


def _host(url: str) -> str:
    return urlparse(url).netloc.lower().removeprefix("www.")


def fetch_unpaywall(doi: str, email: str, timeout: int = 15) -> str:
    """Consulta Unpaywall API e retorna a URL OA do PDF, ou '' se não encontrar."""
    if not doi or not email:
        return ""
    doi = doi.strip().lstrip("https://doi.org/").lstrip("http://doi.org/")
    url = f"https://api.unpaywall.org/v2/{doi}?email={email}"
    try:
        _wait_for_host("api.unpaywall.org")
        r = requests.get(url, timeout=timeout, headers={"User-Agent": "Mozilla/5.0"})
        if r.status_code == 404:
            return ""
        if r.status_code == 429:
            console.print("    [yellow]Unpaywall: rate limit — aguardando 10s[/]")
            time.sleep(10)
            r = requests.get(url, timeout=timeout, headers={"User-Agent": "Mozilla/5.0"})
        if r.status_code != 200:
            return ""
        data = r.json()
        # Preferência: versão publisher OA > repositório
        best = data.get("best_oa_location") or {}
        pdf = best.get("url_for_pdf") or best.get("url") or ""
        if pdf and is_trusted_article_url(pdf):
            return pdf
        # Percorre todas as locations
        for loc in data.get("oa_locations") or []:
            pdf = loc.get("url_for_pdf") or loc.get("url") or ""
            if pdf and is_trusted_article_url(pdf):
                return pdf
    except Exception as e:
        console.print(f"    [dim]Unpaywall error ({doi[:40]}): {e}[/]")
    return ""


def download_with_retry(
    article: dict,
    downloads_dir: Path,
    timeout: int,
    mongo_store: MongoArticleStore | None,
    max_retries: int = 2,
) -> str | None:
    """Download com retry em 429 e rate-limiting por host."""
    pdf_url = article.get("pdf_url", "")
    if not pdf_url or not pdf_url.startswith("http"):
        return None

    host = _host(pdf_url)
    dest = article_pdf_path(article, downloads_dir)
    if dest.exists():
        return str(dest)

    for attempt in range(max_retries + 1):
        _wait_for_host(host)
        try:
            r = requests.get(
                pdf_url,
                timeout=timeout,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
                    ),
                    "Accept": "application/pdf,*/*",
                },
                stream=True,
                allow_redirects=True,
            )
            if r.status_code == 429:
                wait = int(r.headers.get("Retry-After", 15))
                console.print(f"    [yellow]429 rate-limit ({host}) — aguardando {wait}s[/]")
                time.sleep(wait)
                continue
            if r.status_code != 200:
                console.print(f"    [dim]HTTP {r.status_code}: {pdf_url[:70]}[/]")
                return None
            content = b"".join(r.iter_content(8192))
            if b"%PDF" not in content[:32]:
                console.print(f"    [dim]PDF inválido (HTML?): {pdf_url[:70]}[/]")
                return None
            dest.write_bytes(content)
            if mongo_store:
                mongo_store.store_pdf_bytes(article, dest.name, content)
            return str(dest)
        except Exception as e:
            if attempt < max_retries:
                time.sleep(3)
            else:
                console.print(f"    [dim]Erro download: {e} — {pdf_url[:60]}[/]")
    return None


def load_config(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def main() -> None:
    parser = argparse.ArgumentParser(description="Batch PDF Downloader")
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument("--limit", type=int, default=0, help="Máximo de artigos a processar (0=todos)")
    parser.add_argument("--sources", nargs="+", help="Filtrar por fonte (arxiv, ieee, ...)")
    parser.add_argument("--unpaywall-email", default="", help="E-mail para Unpaywall API (recomendado)")
    parser.add_argument("--dry-run", action="store_true", help="Não baixa, só mostra o que faria")
    parser.add_argument("--timeout", type=int, default=40)
    args = parser.parse_args()

    config_path = Path(args.config)
    if not config_path.exists():
        config_path = Path(__file__).parent / args.config
    if not config_path.exists():
        console.print(f"[red]Config não encontrado: {args.config}[/]")
        sys.exit(1)

    cfg = load_config(str(config_path))

    # base_dir no config usa caminhos relativos à raiz do projeto (ragflow/),
    # não ao cwd. A raiz está 2 níveis acima deste script (scripts/article_scraper/).
    PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
    output_cfg = cfg.setdefault("output", {})
    base_dir_raw = output_cfg.get("base_dir", "./results")
    if not Path(base_dir_raw).is_absolute():
        output_cfg["base_dir"] = str((PROJECT_ROOT / base_dir_raw).resolve())

    _, metadata_dir, downloads_dir, _, _ = setup_dirs(cfg)
    mongo_store = maybe_create_mongo_store(cfg)

    unpaywall_email = args.unpaywall_email or cfg.get("unpaywall_email", "")

    # ── Carrega todos os metadatas ──────────────────────────────────────────
    all_files = sorted(metadata_dir.glob("*.json"))
    console.print(f"[dim]{len(all_files)} metadados encontrados em {metadata_dir}[/]")

    articles: list[tuple[Path, dict]] = []
    for f in all_files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        # Filtro por fonte
        if args.sources and data.get("source") not in args.sources:
            continue
        # Pula se já tem PDF local válido
        local = data.get("pdf_local", "")
        if local and Path(local).exists():
            continue
        # Pula se o arquivo derivado já existe no disco
        if article_pdf_path(data, downloads_dir).exists():
            continue
        # Inclui só se tem pdf_url OU tem DOI (para Unpaywall)
        if not data.get("pdf_url") and not data.get("doi"):
            continue
        articles.append((f, data))

    if args.limit:
        articles = articles[: args.limit]

    # ── Sumário ────────────────────────────────────────────────────────────
    has_pdf_url = sum(1 for _, d in articles if d.get("pdf_url"))
    doi_only    = sum(1 for _, d in articles if not d.get("pdf_url") and d.get("doi"))

    console.print(
        Panel.fit(
            f"[bold cyan]Batch PDF Downloader[/]\n"
            f"A processar:  [yellow]{len(articles)}[/] artigos\n"
            f"  └ com pdf_url: [green]{has_pdf_url}[/]\n"
            f"  └ DOI sem pdf_url (Unpaywall): [blue]{doi_only}[/]"
            + (f"\n  └ Unpaywall: [green]{unpaywall_email}[/]" if unpaywall_email else
               "\n  └ Unpaywall: [dim]--unpaywall-email não informado, pulando[/]")
            + ("\n[yellow]DRY-RUN — nenhum arquivo será gravado[/]" if args.dry_run else ""),
            border_style="cyan",
        )
    )

    if not articles:
        console.print("[green]Nada a baixar — todos os artigos já têm PDF local.[/]")
        return

    downloaded = 0
    skipped = 0
    failed = 0
    unpaywall_hits = 0

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TextColumn("{task.completed}/{task.total}"),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("Baixando PDFs", total=len(articles))

        for json_path, article in articles:
            article_id = article.get("id", "?")[:50]
            title = (article.get("title") or "")[:60]
            progress.update(task, description=f"[dim]{article_id[:40]}[/]")

            pdf_url = (article.get("pdf_url") or "").strip()

            # ── Tenta Unpaywall se não tem pdf_url ──────────────────────
            if not pdf_url and article.get("doi") and unpaywall_email:
                progress.update(task, description=f"[blue]Unpaywall: {article_id[:35]}[/]")
                if not args.dry_run:
                    found = fetch_unpaywall(article["doi"], unpaywall_email, args.timeout)
                    if found:
                        article["pdf_url"] = found
                        pdf_url = found
                        unpaywall_hits += 1
                        # Persiste o pdf_url encontrado no JSON
                        article["open_access"] = True
                        json_path.write_text(
                            json.dumps(article, ensure_ascii=False, indent=2), encoding="utf-8"
                        )
                        if mongo_store:
                            mongo_store.upsert_article(article)

            if not pdf_url:
                progress.update(task, advance=1)
                skipped += 1
                continue

            if not is_trusted_article_url(pdf_url):
                console.print(f"  [dim]skip (url fora da whitelist): {pdf_url[:60]}[/]")
                progress.update(task, advance=1)
                skipped += 1
                continue

            if args.dry_run:
                console.print(f"  [dim]dry-run → {pdf_url[:70]}[/]")
                progress.update(task, advance=1)
                downloaded += 1
                continue

            dest = download_with_retry(article, downloads_dir, args.timeout, mongo_store)
            if dest:
                article["pdf_local"] = dest
                json_path.write_text(
                    json.dumps(article, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                if mongo_store:
                    mongo_store.upsert_article(article)
                console.print(f"  [green]✓[/] {Path(dest).name}")
                downloaded += 1
            else:
                failed += 1

            progress.update(task, advance=1)

    if mongo_store:
        mongo_store.close()

    # ── Tabela final ───────────────────────────────────────────────────────
    t = Table(header_style="bold cyan", show_lines=False)
    t.add_column("Resultado", style="bold")
    t.add_column("Qtd", justify="right")
    t.add_row("[green]Baixados[/]",         str(downloaded))
    t.add_row("[blue]Unpaywall hits[/]",    str(unpaywall_hits))
    t.add_row("[yellow]Sem pdf_url[/]",     str(skipped))
    t.add_row("[red]Falhas de download[/]", str(failed))
    console.print(t)
    console.print(f"[dim]PDFs em: {downloads_dir.resolve()}[/]")


if __name__ == "__main__":
    main()
