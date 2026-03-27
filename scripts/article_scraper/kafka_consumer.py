#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

import yaml
from kafka import KafkaConsumer
from rich.console import Console
from rich.panel import Panel

from scraper import (
    DEFAULT_KAFKA_BOOTSTRAP,
    DEFAULT_KAFKA_TOPIC,
    download_pdf,
    is_trusted_article_url,
    maybe_create_mongo_store,
    save_article,
    setup_dirs,
)

console = Console()


def load_config(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def build_kafka_consumer(
    cfg: dict,
    group_id_override: str = "",
    auto_offset_reset_override: str = "",
) -> KafkaConsumer:
    kafka_cfg = cfg.get("kafka", {})
    bootstrap_servers = kafka_cfg.get("bootstrap_servers") or DEFAULT_KAFKA_BOOTSTRAP
    topic = kafka_cfg.get("topic") or DEFAULT_KAFKA_TOPIC
    group_id = group_id_override or kafka_cfg.get("group_id", "article-scraper-downloaders")
    auto_offset_reset = auto_offset_reset_override or kafka_cfg.get("auto_offset_reset", "earliest")

    consumer = KafkaConsumer(
        topic,
        bootstrap_servers=bootstrap_servers,
        group_id=group_id,
        auto_offset_reset=auto_offset_reset,
        enable_auto_commit=True,
        value_deserializer=lambda value: json.loads(value.decode("utf-8")),
        key_deserializer=lambda value: value.decode("utf-8") if value else None,
        consumer_timeout_ms=int(kafka_cfg.get("consumer_timeout_ms", 5000)),
        max_poll_records=int(kafka_cfg.get("max_poll_records", 20)),
    )
    return consumer


def main() -> None:
    parser = argparse.ArgumentParser(description="Article Scraper Kafka consumer")
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument("--max-messages", type=int, default=0, help="0 = sem limite")
    parser.add_argument("--idle-timeout-sec", type=int, default=-1, help="-1 usa config; 0 = nunca encerrar por ociosidade")
    parser.add_argument("--group-id", default="", help="Override do consumer group")
    parser.add_argument("--from-beginning", action="store_true", help="Lê desde o início usando um group_id novo")
    args = parser.parse_args()

    config_path = Path(args.config)
    if not config_path.exists():
        config_path = Path(__file__).parent / args.config
    if not config_path.exists():
        console.print(f"[red]Config não encontrado: {args.config}[/]")
        sys.exit(1)

    cfg = load_config(str(config_path))
    _, metadata_dir, downloads_dir, _, _ = setup_dirs(cfg)
    mongo_store = maybe_create_mongo_store(cfg)
    kafka_cfg = cfg.get("kafka", {})
    topic = kafka_cfg.get("topic") or DEFAULT_KAFKA_TOPIC
    group_id = args.group_id or kafka_cfg.get("group_id", "article-scraper-downloaders")
    auto_offset_reset = kafka_cfg.get("auto_offset_reset", "earliest")
    if args.from_beginning and not args.group_id:
        group_id = f"{group_id}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        auto_offset_reset = "earliest"

    consumer = build_kafka_consumer(
        cfg,
        group_id_override=group_id,
        auto_offset_reset_override=auto_offset_reset,
    )

    dl_cfg = cfg.get("downloads", {})
    oa_only = dl_cfg.get("open_access_only", True)
    dl_timeout = int(dl_cfg.get("timeout", 40))
    idle_timeout_sec = (
        int(cfg.get("kafka", {}).get("idle_timeout_sec", 0))
        if args.idle_timeout_sec < 0
        else args.idle_timeout_sec
    )

    processed = 0
    downloaded = 0
    skipped = 0
    last_message_at = time.time()
    idle_timeout_label = "infinito" if idle_timeout_sec == 0 else f"{idle_timeout_sec}s"

    console.print(
        Panel.fit(
            "[bold cyan]Article Scraper Consumer[/]\n"
            f"Topic: [dim]{topic}[/]\n"
            f"Group: [dim]{group_id}[/]\n"
            f"Downloads: [dim]{downloads_dir.resolve()}[/]\n"
            f"Metadata: [dim]{metadata_dir.resolve()}[/]\n"
            f"Idle timeout: [yellow]{idle_timeout_label}[/]",
            border_style="cyan",
        )
    )

    try:
        while True:
            batches = consumer.poll(timeout_ms=1000)
            if not batches:
                if idle_timeout_sec > 0 and time.time() - last_message_at >= idle_timeout_sec:
                    break
                continue

            last_message_at = time.time()
            for records in batches.values():
                for message in records:
                    article = message.value
                    article_id = article.get("id", "<sem-id>")
                    title = article.get("title", "")[:80]
                    save_article(article, metadata_dir, mongo_store)

                    if oa_only and not article.get("open_access"):
                        console.print(f"[yellow]skip[/] {article_id} sem open_access | {title}")
                        skipped += 1
                        processed += 1
                        continue

                    pdf_url = (article.get("pdf_url") or "").strip()
                    if not pdf_url.startswith("http"):
                        console.print(f"[yellow]skip[/] {article_id} sem pdf_url válido | {title}")
                        skipped += 1
                        processed += 1
                        continue
                    if not is_trusted_article_url(pdf_url):
                        console.print(f"[yellow]skip[/] {article_id} pdf_url fora da whitelist | {title}")
                        skipped += 1
                        processed += 1
                        continue

                    dest = download_pdf(article, downloads_dir, dl_timeout, mongo_store)
                    if dest:
                        article["pdf_local"] = dest
                        save_article(article, metadata_dir, mongo_store)
                        console.print(f"[green]download[/] {article_id} -> {Path(dest).name}")
                        downloaded += 1
                    else:
                        console.print(f"[yellow]skip[/] {article_id} falha no download | {title}")
                        skipped += 1

                    processed += 1
                    if args.max_messages and processed >= args.max_messages:
                        raise StopIteration
    except StopIteration:
        pass
    except KeyboardInterrupt:
        console.print("\n[yellow]Consumer interrompido manualmente.[/]")
    finally:
        consumer.close()
        if mongo_store:
            mongo_store.close()

    console.print(
        Panel.fit(
            f"[bold green]Consumer concluído![/]\n"
            f"Mensagens processadas: [yellow]{processed}[/]\n"
            f"PDFs disponíveis: [yellow]{downloaded}[/]\n"
            f"Pulados/sem download: [yellow]{skipped}[/]",
            border_style="green",
        )
    )


if __name__ == "__main__":
    main()
