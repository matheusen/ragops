#!/usr/bin/env python3
"""
ingest_pipeline.py — Pipeline de ingestão automática

Lê os PDFs baixados pelo scraper (results/downloads/*.pdf),
cruza com os metadados (results/metadata/*.json) e faz POST
em lote para o endpoint /api/v1/articles/ingest do backend RAG.

Uso:
  python ingest_pipeline.py
  python ingest_pipeline.py --results-dir results --api http://localhost:8000
  python ingest_pipeline.py --batch-size 10 --dry-run
  python ingest_pipeline.py --collection books --source-tag ai-papers
  python ingest_pipeline.py --list-ingested
  python ingest_pipeline.py --reset-state     # reingere tudo (apaga controle)

Requisitos:
  pip install requests rich

O script mantém um arquivo de controle (ingest_state.json) no mesmo diretório
dos metadados para rastrear quais PDFs já foram ingeridos com sucesso.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from rich.console import Console
from rich.panel import Panel
from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn, TimeElapsedColumn
from rich.table import Table

console = Console()

# ── Defaults ──────────────────────────────────────────────────────────────────
DEFAULT_API       = "http://localhost:8000"
DEFAULT_RESULTS   = "./results"
DEFAULT_BATCH     = 8
DEFAULT_DELAY     = 0.5          # segundos entre batches
STATE_FILE_NAME   = "ingest_state.json"

# ── Estado persistente ────────────────────────────────────────────────────────

def load_state(state_path: Path) -> dict:
    """Carrega controle de quais arquivos já foram ingeridos."""
    if state_path.exists():
        try:
            return json.loads(state_path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"ingested": {}, "failed": {}}


def save_state(state: dict, state_path: Path) -> None:
    state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


# ── Metadados ─────────────────────────────────────────────────────────────────

def load_all_metadata(metadata_dir: Path) -> dict[str, dict]:
    """Retorna dict: pdf_local_path → metadata dict."""
    by_path: dict[str, dict] = {}
    by_title: dict[str, dict] = {}

    for f in metadata_dir.glob("*.json"):
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
            local = d.get("pdf_local", "")
            title = (d.get("title") or "").strip()
            if local:
                by_path[str(Path(local).resolve())] = d
            if title:
                by_title[title.lower()] = d
        except Exception:
            pass

    return by_path, by_title


def find_metadata_for_pdf(
    pdf: Path,
    by_path: dict[str, dict],
    by_title: dict[str, dict],
) -> dict | None:
    """Tenta associar um PDF ao seu metadado pelo caminho ou pelo título derivado do nome."""
    meta = by_path.get(str(pdf.resolve()))
    if meta:
        return meta
    # Fallback: nome do arquivo derivado do título
    stem = pdf.stem.lower().replace("_", " ")
    return by_title.get(stem)


# ── Ingestão ──────────────────────────────────────────────────────────────────

def ingest_batch(
    paths: list[str],
    titles: list[str | None],
    api_base: str,
    collection: str,
    source_tags: list[str],
    timeout: int = 120,
) -> tuple[list[dict], list[str]]:
    """
    Envia um lote de caminhos para POST /articles/ingest.
    Retorna (sucessos, erros).
    """
    url = f"{api_base.rstrip('/')}/api/v1/articles/ingest"
    payload: dict = {
        "paths": paths,
        "collection": collection,
        "source_tags": source_tags,
    }
    if any(t for t in titles):
        payload["titles"] = [t or "" for t in titles]

    try:
        r = requests.post(url, json=payload, timeout=timeout)
        r.raise_for_status()
        results = r.json()
        if isinstance(results, list):
            return results, []
        return [], [f"Resposta inesperada: {str(results)[:80]}"]
    except requests.exceptions.ConnectionError:
        return [], [f"Conexão recusada em {url}. Backend está rodando?"]
    except requests.exceptions.Timeout:
        return [], [f"Timeout ({timeout}s) ao ingerir lote"]
    except Exception as e:
        return [], [str(e)]


# ── Report ────────────────────────────────────────────────────────────────────

def print_summary_table(results: list[dict]) -> None:
    t = Table(title="Resultado da ingestão", header_style="bold cyan", show_lines=False)
    t.add_column("Título",     width=55, no_wrap=True)
    t.add_column("Chunks",     justify="right", width=7)
    t.add_column("Tópicos",    width=35, no_wrap=True)
    t.add_column("MinIO",      justify="center", width=6)
    t.add_column("Status",     justify="center", width=7)
    for r in results:
        ok     = r.get("ok", False)
        chunks = r.get("chunks_indexed", 0)
        topics = ", ".join(r.get("topics", [])[:5])
        has_minio = bool(r.get("minio_key"))
        t.add_row(
            (r.get("title") or r.get("path") or "?")[:55],
            str(chunks),
            topics or "—",
            "✓" if has_minio else "",
            "[green]ok[/]" if ok else "[red]erro[/]",
        )
    console.print(t)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest pipeline — scraper → RAG")
    parser.add_argument("--results-dir",  default=DEFAULT_RESULTS, help="Diretório base do scraper")
    parser.add_argument("--api",          default=DEFAULT_API,     help="URL base do backend RAG")
    parser.add_argument("--batch-size",   type=int, default=DEFAULT_BATCH)
    parser.add_argument("--collection",   default="articles",      help="Coleção Qdrant")
    parser.add_argument("--source-tag",   default="",              help="Tag de origem (ex: bulk-2025)")
    parser.add_argument("--delay",        type=float, default=DEFAULT_DELAY, help="Delay entre batches (s)")
    parser.add_argument("--dry-run",      action="store_true",     help="Simula sem chamar a API")
    parser.add_argument("--list-ingested",action="store_true",     help="Lista arquivos já ingeridos")
    parser.add_argument("--reset-state",  action="store_true",     help="Apaga controle e reingere tudo")
    parser.add_argument("--min-year",     type=int, default=0,     help="Filtra PDFs com ano < min-year")
    parser.add_argument("--open-access-only", action="store_true", help="Só ingere artigos open access")
    parser.add_argument("--timeout",      type=int, default=120,   help="Timeout HTTP por lote (s)")
    args = parser.parse_args()

    results_dir  = Path(args.results_dir)
    metadata_dir = results_dir / "metadata"
    downloads_dir = results_dir / "downloads"
    state_path   = metadata_dir / STATE_FILE_NAME
    source_tags  = [args.source_tag] if args.source_tag else []

    # Verifica dirs
    if not downloads_dir.exists():
        console.print(f"[red]Diretório de downloads não encontrado: {downloads_dir}[/]")
        console.print("[dim]Execute o scraper primeiro:[/]  python scraper.py --config config_bulk.yaml")
        sys.exit(1)

    # Carrega metadados
    by_path, by_title = load_all_metadata(metadata_dir) if metadata_dir.exists() else ({}, {})

    # Controle de estado
    if args.reset_state and state_path.exists():
        state_path.unlink()
        console.print("[yellow]Estado de ingestão resetado.[/]")

    state = load_state(state_path)

    if args.list_ingested:
        ingested = state.get("ingested", {})
        console.print(f"[cyan]{len(ingested)} arquivos já ingeridos:[/]")
        for path, info in list(ingested.items())[:60]:
            console.print(f"  [green]✓[/] {Path(path).name}  ({info.get('chunks', '?')} chunks)")
        if len(ingested) > 60:
            console.print(f"  [dim]... e mais {len(ingested) - 60}[/]")
        return

    # Coleta PDFs pendentes
    all_pdfs = sorted(downloads_dir.glob("*.pdf"))
    if not all_pdfs:
        console.print(f"[yellow]Nenhum PDF em {downloads_dir}[/]")
        console.print("[dim]Verifique se o scraper rodou com downloads.enabled: true[/]")
        sys.exit(0)

    ingested_paths = set(state.get("ingested", {}).keys())
    pending: list[tuple[Path, dict | None]] = []

    for pdf in all_pdfs:
        key = str(pdf.resolve())
        if key in ingested_paths:
            continue
        meta = find_metadata_for_pdf(pdf, by_path, by_title)

        # Filtros opcionais
        if args.min_year and meta:
            year = meta.get("year") or 0
            if year and year < args.min_year:
                continue
        if args.open_access_only and meta:
            if not meta.get("open_access", False):
                continue

        pending.append((pdf, meta))

    console.print(Panel.fit(
        f"[bold cyan]Ingest Pipeline[/]\n"
        f"Backend:    [green]{args.api}[/]\n"
        f"Coleção:    [yellow]{args.collection}[/]\n"
        f"Total PDFs: [white]{len(all_pdfs)}[/]\n"
        f"Já ingeridos: [dim]{len(ingested_paths)}[/]\n"
        f"Pendentes:  [bold yellow]{len(pending)}[/]\n"
        f"Batch size: {args.batch_size}  |  "
        f"{'[yellow]DRY RUN[/]' if args.dry_run else '[green]PRODUÇÃO[/]'}",
        border_style="cyan",
    ))

    if not pending:
        console.print("[green]Nada a ingerir — todos os PDFs já foram processados.[/]")
        console.print("[dim]Use --reset-state para reingerir tudo.[/]")
        return

    # Confirmação antes de rodar
    if not args.dry_run:
        try:
            r = requests.get(f"{args.api.rstrip('/')}/api/v1/health", timeout=5)
            r.raise_for_status()
        except Exception as e:
            console.print(f"[red]Backend inacessível em {args.api}: {e}[/]")
            console.print("[dim]Inicie o backend com:  uvicorn jira_issue_rag.main:app --reload[/]")
            sys.exit(1)

    total_ok     = 0
    total_chunks = 0
    total_fail   = 0
    all_results: list[dict] = []

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TextColumn("{task.completed}/{task.total}"),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("Ingerindo…", total=len(pending))

        for batch_start in range(0, len(pending), args.batch_size):
            batch = pending[batch_start : batch_start + args.batch_size]
            paths  = [str(p.resolve()) for p, _ in batch]
            titles = [(m.get("title") or None) if m else None for _, m in batch]

            short_names = [p.name[:35] for p, _ in batch[:3]]
            desc = ", ".join(short_names) + ("…" if len(batch) > 3 else "")
            progress.update(task, description=f"[cyan]{desc}")

            if args.dry_run:
                console.print(f"[dim]DRY RUN lote {batch_start//args.batch_size+1}: {paths}[/]")
                for p, _ in batch:
                    state["ingested"][str(p.resolve())] = {"dry_run": True, "at": datetime.now(timezone.utc).isoformat()}
                progress.advance(task, len(batch))
                continue

            results, errors = ingest_batch(
                paths=paths,
                titles=titles,
                api_base=args.api,
                collection=args.collection,
                source_tags=source_tags,
                timeout=args.timeout,
            )

            if errors:
                for e in errors:
                    console.print(f"  [red]✗ Lote erro: {e}[/]")
                total_fail += len(batch)
                # Registra como falha
                for p, _ in batch:
                    state.setdefault("failed", {})[str(p.resolve())] = {
                        "error": errors[0], "at": datetime.now(timezone.utc).isoformat()
                    }
            else:
                for r, (pdf, meta) in zip(results, batch):
                    ok = r.get("ok", False)
                    chunks = r.get("chunks_indexed", 0)
                    if ok:
                        total_ok += 1
                        total_chunks += chunks
                        key = str(pdf.resolve())
                        state["ingested"][key] = {
                            "chunks": chunks,
                            "doc_id": r.get("doc_id", ""),
                            "minio_key": r.get("minio_key"),
                            "at": datetime.now(timezone.utc).isoformat(),
                        }
                        state.get("failed", {}).pop(key, None)
                    else:
                        total_fail += 1
                        err = r.get("error", "erro desconhecido")
                        console.print(f"  [red]✗[/] {pdf.name}: {err}")
                    all_results.append(r)

                # Salva estado a cada lote
                save_state(state, state_path)

            progress.advance(task, len(batch))

            if args.delay > 0:
                time.sleep(args.delay)

    # Salva estado final
    if not args.dry_run:
        save_state(state, state_path)

    # Relatório
    console.print(Panel.fit(
        f"[bold green]Concluído![/]\n"
        f"Ingeridos com sucesso: [yellow]{total_ok}[/]\n"
        f"Total chunks indexados: [yellow]{total_chunks}[/]\n"
        f"Falhas: [{'red' if total_fail else 'dim'}]{total_fail}[/]\n"
        f"Estado salvo em: [dim]{state_path}[/]",
        border_style="green",
    ))

    if all_results and not args.dry_run:
        show = all_results[:30]
        print_summary_table(show)
        if len(all_results) > 30:
            console.print(f"[dim]... e mais {len(all_results) - 30} resultados[/]")

    # Retorna código de saída adequado
    if total_fail > 0 and total_ok == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
