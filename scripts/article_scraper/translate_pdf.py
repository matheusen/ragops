#!/usr/bin/env python3
"""
Traduz PDF de artigo do ingles para portugues preservando o layout o maximo possivel.

Estrategia:
  1. Extrai blocos de texto vetorial do PDF com PyMuPDF.
  2. Traduz cada bloco com um backend neural (OpenAI compativel ou Hugging Face local).
  3. Remove apenas as areas de texto e reinsere o texto traduzido nas mesmas caixas.
  4. Mantem paginas, imagens e graficos originais.

Uso:
  python translate_pdf.py --input artigo.pdf
  python translate_pdf.py --input artigo.pdf --output artigo.ptbr.pdf
  python translate_pdf.py --input artigo.pdf --provider openai --model gpt-4.1-mini
  python translate_pdf.py --input artigo.pdf --provider nllb
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

import requests
from rich.console import Console
from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn, TimeElapsedColumn

try:
    import fitz
except ImportError:
    fitz = None  # type: ignore[assignment]

if TYPE_CHECKING:
    import fitz as fitz_type
else:
    fitz_type = Any

console = Console()


STANDARD_FONTS = {
    ("times", False, False): "Times-Roman",
    ("times", True, False): "Times-Bold",
    ("times", False, True): "Times-Italic",
    ("times", True, True): "Times-BoldItalic",
    ("helvetica", False, False): "Helvetica",
    ("helvetica", True, False): "Helvetica-Bold",
    ("helvetica", False, True): "Helvetica-Oblique",
    ("helvetica", True, True): "Helvetica-BoldOblique",
    ("courier", False, False): "Courier",
    ("courier", True, False): "Courier-Bold",
    ("courier", False, True): "Courier-Oblique",
    ("courier", True, True): "Courier-BoldOblique",
}


@dataclass
class TextBlock:
    page_number: int
    bbox: tuple[float, float, float, float]
    text: str
    fontname: str
    fontsize: float
    color: tuple[float, float, float]
    align: int


def ensure_dependencies() -> None:
    if fitz is None:
        console.print("[red]PyMuPDF nao instalado. Rode `pip install PyMuPDF`.[/]")
        sys.exit(1)


def load_env_files() -> None:
    candidates = [
        Path.cwd() / ".env",
        Path(__file__).resolve().parent / ".env",
        Path(__file__).resolve().parents[2] / ".env",
    ]
    for path in candidates:
        if not path.exists():
            continue
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


def normalize_whitespace(text: str) -> str:
    text = text.replace("\xa0", " ")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def looks_translatable(text: str, min_chars: int) -> bool:
    stripped = text.strip()
    if len(stripped) < min_chars:
        return False
    letters = sum(1 for ch in stripped if ch.isalpha())
    if not letters:
        return False
    symbol_ratio = sum(1 for ch in stripped if ch in "=<>^_{}[]|~\\/") / max(len(stripped), 1)
    if symbol_ratio > 0.18:
        return False
    return True


def map_font(fontname: str) -> str:
    lower = (fontname or "").lower()
    family = "helvetica"
    if any(token in lower for token in ("times", "nimbusrom", "serif", "garamond", "cambria")):
        family = "times"
    elif any(token in lower for token in ("courier", "mono", "consola", "menlo")):
        family = "courier"
    bold = "bold" in lower or lower.endswith("bd")
    italic = any(token in lower for token in ("italic", "oblique", "it"))
    return STANDARD_FONTS[(family, bold, italic)]


def int_to_rgb(color: int) -> tuple[float, float, float]:
    if not isinstance(color, int):
        return (0.0, 0.0, 0.0)
    r = ((color >> 16) & 255) / 255.0
    g = ((color >> 8) & 255) / 255.0
    b = (color & 255) / 255.0
    return (r, g, b)


def detect_alignment(block: dict) -> int:
    lines = block.get("lines") or []
    if not lines:
        return 0
    x0, _, x1, _ = block["bbox"]
    widths = []
    for line in lines:
        lb = line.get("bbox")
        if not lb:
            continue
        left_gap = abs(lb[0] - x0)
        right_gap = abs(x1 - lb[2])
        widths.append((left_gap, right_gap))
    if not widths:
        return 0
    avg_left = sum(g[0] for g in widths) / len(widths)
    avg_right = sum(g[1] for g in widths) / len(widths)
    if abs(avg_left - avg_right) <= 8:
        return 1
    if avg_left - avg_right > 12:
        return 2
    return 0


def extract_text_blocks(doc: fitz_type.Document, min_chars: int) -> list[TextBlock]:
    blocks: list[TextBlock] = []
    for page_number, page in enumerate(doc):
        data = page.get_text("dict")
        for block in data.get("blocks", []):
            if block.get("type") != 0:
                continue

            line_texts: list[str] = []
            first_span: dict[str, Any] | None = None

            for line in block.get("lines", []):
                spans = line.get("spans", [])
                parts: list[str] = []
                for span in spans:
                    text = span.get("text", "")
                    if text:
                        parts.append(text)
                        if first_span is None:
                            first_span = span
                if parts:
                    line_texts.append("".join(parts).strip())

            text = normalize_whitespace("\n".join(t for t in line_texts if t))
            if not looks_translatable(text, min_chars):
                continue
            if first_span is None:
                continue

            bbox = tuple(float(v) for v in block["bbox"])
            blocks.append(
                TextBlock(
                    page_number=page_number,
                    bbox=bbox,
                    text=text,
                    fontname=map_font(first_span.get("font", "Helvetica")),
                    fontsize=max(7.0, float(first_span.get("size", 10.0))),
                    color=int_to_rgb(first_span.get("color", 0)),
                    align=detect_alignment(block),
                )
            )
    return blocks


def split_for_translation(text: str, max_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]

    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for paragraph in text.split("\n\n"):
        piece = paragraph.strip()
        if not piece:
            continue
        extra = len(piece) + (2 if current else 0)
        if current and current_len + extra > max_chars:
            chunks.append("\n\n".join(current))
            current = [piece]
            current_len = len(piece)
        else:
            current.append(piece)
            current_len += extra
    if current:
        chunks.append("\n\n".join(current))
    return chunks or [text]


class Translator:
    def translate(self, text: str) -> str:
        raise NotImplementedError


class OpenAICompatibleTranslator(Translator):
    def __init__(self, model: str, api_key: str, api_base: str, temperature: float, timeout: int) -> None:
        self.model = model
        self.api_key = api_key
        self.api_base = api_base.rstrip("/")
        self.temperature = temperature
        self.timeout = timeout

    def translate(self, text: str) -> str:
        payload = {
            "model": self.model,
            "temperature": self.temperature,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Translate academic English to Brazilian Portuguese. "
                        "Preserve equations, citations, URLs, DOI, acronyms and line breaks when possible. "
                        "Keep the tone technical and precise. Return only the translated text."
                    ),
                },
                {"role": "user", "content": text},
            ],
        }
        response = requests.post(
            f"{self.api_base}/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=self.timeout,
        )
        response.raise_for_status()
        data = response.json()
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise RuntimeError(f"Resposta inesperada do provedor: {data}") from exc
        return normalize_whitespace(content)


class NLLBTranslator(Translator):
    def __init__(self, model_name: str) -> None:
        try:
            from transformers import pipeline
        except ImportError as exc:
            raise RuntimeError(
                "Para usar --provider nllb instale: pip install transformers torch sentencepiece"
            ) from exc

        self.pipe = pipeline(
            "translation",
            model=model_name,
            src_lang="eng_Latn",
            tgt_lang="por_Latn",
        )

    def translate(self, text: str) -> str:
        output = self.pipe(text, max_length=2048)
        return normalize_whitespace(output[0]["translation_text"])


def build_translator(args: argparse.Namespace) -> Translator:
    if args.provider == "nllb":
        return NLLBTranslator(args.model or "facebook/nllb-200-distilled-600M")

    api_key = args.api_key or os.getenv("OPENAI_API_KEY")
    if not api_key:
        console.print(
            "[red]OPENAI_API_KEY nao encontrado. Defina a variavel de ambiente, use --api-key "
            "ou rode com --provider nllb.[/]"
        )
        sys.exit(1)
    model = args.model or "gpt-4.1-mini"
    api_base = args.api_base or os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
    return OpenAICompatibleTranslator(
        model=model,
        api_key=api_key,
        api_base=api_base,
        temperature=args.temperature,
        timeout=args.timeout,
    )


def translate_block_text(translator: Translator, text: str, max_chars: int, pause_sec: float) -> str:
    chunks = split_for_translation(text, max_chars=max_chars)
    translated: list[str] = []
    for index, chunk in enumerate(chunks):
        translated.append(translator.translate(chunk))
        if pause_sec > 0 and index < len(chunks) - 1:
            time.sleep(pause_sec)
    return "\n\n".join(translated).strip()


def fit_textbox(
    page: fitz_type.Page,
    bbox: tuple[float, float, float, float],
    text: str,
    fontname: str,
    color: tuple[float, float, float],
    base_size: float,
    align: int,
) -> None:
    rect = fitz.Rect(*bbox)
    fontsize = base_size
    margin = 1.0
    draw_rect = fitz.Rect(rect.x0 + margin, rect.y0 + margin, rect.x1 - margin, rect.y1 - margin)

    for _ in range(10):
        remaining = page.insert_textbox(
            draw_rect,
            text,
            fontname=fontname,
            fontsize=fontsize,
            color=color,
            align=align,
            lineheight=1.15,
            overlay=True,
        )
        if remaining >= 0:
            return
        page.wrap_contents()
        fontsize -= 0.5
        if fontsize < 5.0:
            break
        page = page.parent[page.number]

    page.insert_textbox(
        draw_rect,
        text,
        fontname=fontname,
        fontsize=max(fontsize, 4.8),
        color=color,
        align=align,
        lineheight=1.05,
        overlay=True,
    )


def apply_translations(
    doc: fitz_type.Document,
    blocks: list[TextBlock],
    translations: list[str],
    keep_original: bool,
) -> None:
    page_to_items: dict[int, list[tuple[TextBlock, str]]] = {}
    for block, translated in zip(blocks, translations):
        page_to_items.setdefault(block.page_number, []).append((block, translated))

    for page_number, items in page_to_items.items():
        page = doc[page_number]
        if not keep_original:
            for block, _ in items:
                page.add_redact_annot(fitz.Rect(*block.bbox), fill=(1, 1, 1))
            page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

        for block, translated in items:
            fit_textbox(
                page=page,
                bbox=block.bbox,
                text=translated,
                fontname=block.fontname,
                color=block.color,
                base_size=block.fontsize,
                align=block.align,
            )


def default_output_path(input_path: Path) -> Path:
    output_dir = input_path.parent / "artigos em portugues"
    return output_dir / f"{input_path.stem} PT.pdf"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Traduz PDF de artigo para portugues preservando layout.")
    parser.add_argument("--input", required=True, help="PDF de entrada")
    parser.add_argument("--output", default="", help="PDF traduzido de saida")
    parser.add_argument("--provider", choices=("openai", "nllb"), default="openai")
    parser.add_argument("--model", default="", help="Modelo do provedor selecionado")
    parser.add_argument("--api-key", default="", help="Chave da API OpenAI compativel")
    parser.add_argument("--api-base", default="", help="Base URL compativel com OpenAI")
    parser.add_argument("--temperature", type=float, default=0.1)
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--min-chars", type=int, default=12, help="Ignora blocos muito curtos")
    parser.add_argument("--max-chars", type=int, default=2800, help="Quebra blocos longos antes de traduzir")
    parser.add_argument("--pause-sec", type=float, default=0.0, help="Espera entre chamadas de traducao")
    parser.add_argument("--keep-original", action="store_true", help="Mantem o texto original por baixo")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    ensure_dependencies()
    load_env_files()

    input_path = Path(args.input).expanduser().resolve()
    if not input_path.exists():
        console.print(f"[red]PDF nao encontrado: {input_path}[/]")
        sys.exit(1)

    output_path = Path(args.output).expanduser().resolve() if args.output else default_output_path(input_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    translator = build_translator(args)
    doc = fitz.open(input_path)
    blocks = extract_text_blocks(doc, min_chars=args.min_chars)

    if not blocks:
        console.print("[yellow]Nenhum bloco de texto vetorial foi encontrado. PDFs escaneados exigem OCR antes.[/]")
        sys.exit(1)

    translations: list[str] = []
    console.print(
        f"[cyan]Blocos detectados:[/] {len(blocks)} | "
        f"[cyan]Paginas:[/] {doc.page_count} | "
        f"[cyan]Provider:[/] {args.provider}"
    )

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TextColumn("{task.completed}/{task.total}"),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("Traduzindo blocos", total=len(blocks))
        for block in blocks:
            translated = translate_block_text(
                translator=translator,
                text=block.text,
                max_chars=args.max_chars,
                pause_sec=args.pause_sec,
            )
            translations.append(translated or block.text)
            progress.advance(task)

    apply_translations(doc, blocks, translations, keep_original=args.keep_original)
    doc.save(output_path, garbage=4, deflate=True)
    doc.close()

    console.print(f"[green]PDF traduzido salvo em:[/] {output_path}")


if __name__ == "__main__":
    main()
