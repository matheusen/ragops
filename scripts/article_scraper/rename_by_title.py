#!/usr/bin/env python3
"""
Rename PDFs — renomeia os arquivos PDF com base no campo `title` do JSON de metadados.

Uso:
  python rename_by_title.py
  python rename_by_title.py --config config.yaml
  python rename_by_title.py --dry-run          # mostra o que faria sem renomear
  python rename_by_title.py --limit 50         # processa só N artigos
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import yaml
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

sys.path.insert(0, str(Path(__file__).parent))
from scraper import maybe_create_mongo_store, setup_dirs

console = Console()


def sanitize_filename(value: str, fallback: str = "untitled", limit: int = 120) -> str:
    cleaned = re.sub(r'[\\/*?:"<>|]', "_", (value or "").strip())
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    return (cleaned or fallback)[:limit]


def load_config(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def main() -> None:
    parser = argparse.ArgumentParser(description="Rename PDFs by article title")
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument("--dry-run", action="store_true", help="Mostra renomeações sem executar")
    parser.add_argument("--limit", type=int, default=0, help="Máximo de arquivos a processar (0=todos)")
    args = parser.parse_args()

    config_path = Path(args.config)
    if not config_path.exists():
        config_path = Path(__file__).parent / args.config
    if not config_path.exists():
        console.print(f"[red]Config não encontrado: {args.config}[/]")
        sys.exit(1)

    cfg = load_config(str(config_path))

    PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
    output_cfg = cfg.setdefault("output", {})
    base_dir_raw = output_cfg.get("base_dir", "./results")
    if not Path(base_dir_raw).is_absolute():
        output_cfg["base_dir"] = str((PROJECT_ROOT / base_dir_raw).resolve())

    _, metadata_dir, downloads_dir, _, _ = setup_dirs(cfg)
    mongo_store = maybe_create_mongo_store(cfg)

    json_files = sorted(metadata_dir.glob("*.json"))
    console.print(f"[dim]{len(json_files)} metadados encontrados em {metadata_dir}[/]")

    renamed = 0
    skipped_no_pdf = 0
    skipped_no_title = 0
    skipped_same_name = 0
    failed = 0
    conflicts = 0

    # Rastreia nomes-alvo já usados nesta execução para evitar colisão
    used_names: set[str] = set()

    rows: list[tuple[str, str, str]] = []  # (status, old, new)

    articles = []
    for f in json_files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            articles.append((f, data))
        except Exception:
            continue

    if args.limit:
        articles = articles[: args.limit]

    for json_path, article in articles:
        title = (article.get("title") or "").strip()
        if not title:
            skipped_no_title += 1
            continue

        # Localiza o PDF — prioridade: pdf_local > derivado do id/doi/title
        pdf_local = article.get("pdf_local", "").strip()
        current_pdf: Path | None = None

        if pdf_local:
            p = Path(pdf_local)
            if p.exists():
                current_pdf = p
            elif (downloads_dir / p.name).exists():
                current_pdf = downloads_dir / p.name

        if current_pdf is None:
            # Tenta achar pelo nome derivado do id
            candidate = downloads_dir / f"{sanitize_filename(article.get('id', ''), limit=80)}.pdf"
            if candidate.exists():
                current_pdf = candidate

        if current_pdf is None:
            skipped_no_pdf += 1
            continue

        # Gera nome-alvo a partir do título
        new_name = sanitize_filename(title) + ".pdf"

        # Resolve conflitos adicionando sufixo numérico
        target = downloads_dir / new_name
        if new_name in used_names and target != current_pdf:
            base = sanitize_filename(title)
            counter = 2
            while f"{base}_{counter}.pdf" in used_names:
                counter += 1
            new_name = f"{base}_{counter}.pdf"
            target = downloads_dir / new_name
            conflicts += 1

        used_names.add(new_name)

        if target == current_pdf or current_pdf.name == new_name:
            skipped_same_name += 1
            continue

        rows.append(("rename", current_pdf.name, new_name))

        if not args.dry_run:
            try:
                current_pdf.rename(target)
                article["pdf_local"] = str(target)
                json_path.write_text(
                    json.dumps(article, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                if mongo_store:
                    mongo_store.upsert_article(article)
                renamed += 1
            except Exception as e:
                console.print(f"  [red]✗ Erro ao renomear {current_pdf.name}: {e}[/]")
                failed += 1
        else:
            renamed += 1

    if mongo_store:
        mongo_store.close()

    # ── Tabela de resultados ───────────────────────────────────────────────
    if rows:
        t = Table(header_style="bold cyan", show_lines=False, title="Renomeações")
        t.add_column("Arquivo original", style="dim", max_width=55)
        t.add_column("Novo nome", max_width=65)
        for _, old, new in rows[:100]:
            t.add_row(old, new)
        if len(rows) > 100:
            t.add_row(f"… e mais {len(rows) - 100}", "")
        console.print(t)

    label = "[yellow]DRY-RUN — nenhum arquivo foi alterado[/]\n" if args.dry_run else ""
    console.print(
        Panel.fit(
            f"{label}"
            f"[green]Renomeados:[/]       {renamed}\n"
            f"[dim]Sem PDF local:[/]    {skipped_no_pdf}\n"
            f"[dim]Sem título:[/]       {skipped_no_title}\n"
            f"[dim]Já corretos:[/]      {skipped_same_name}\n"
            f"[yellow]Conflitos resolvidos:[/] {conflicts}\n"
            f"[red]Falhas:[/]           {failed}",
            border_style="cyan",
            title="Resumo",
        )
    )


if __name__ == "__main__":
    main()
