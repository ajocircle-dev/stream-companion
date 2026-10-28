"""Serve local Yoruba-English inference through CTranslate2's NLLB model."""

from __future__ import annotations

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

MODEL_PATH = Path(
    os.environ.get(
        "NLLB_MODEL_PATH",
        "/workspace/models/nllb-200-distilled-600M-ct2-int8",
    )
)
HOST = os.environ.get("NLLB_HOST", "127.0.0.1")
PORT = int(os.environ.get("NLLB_PORT", "5001"))
LANGUAGES = {"yo": "yor_Latn", "en": "eng_Latn"}
MODEL_LOCK = threading.Lock()


def load_model() -> tuple[Any, Any]:
    """Load tokenizer assets and the quantized CT2 model from local disk only."""
    import ctranslate2
    from transformers import AutoTokenizer

    if not MODEL_PATH.is_dir():
        raise FileNotFoundError(f"NLLB model directory not found: {MODEL_PATH}")

    tokenizer = AutoTokenizer.from_pretrained(
        str(MODEL_PATH),
        local_files_only=True,
    )
    translator = ctranslate2.Translator(
        str(MODEL_PATH),
        device="cpu",
        compute_type="int8",
        inter_threads=1,
        intra_threads=max(1, min(4, os.cpu_count() or 1)),
    )
    return tokenizer, translator


def translate_text(
    tokenizer: Any,
    translator: Any,
    text: str,
    source_language: str,
    target_language: str,
) -> str:
    """Run one translation with explicit NLLB source and target language tags."""
    source_code = LANGUAGES.get(source_language, source_language)
    target_code = LANGUAGES.get(target_language, target_language)

    if {source_code, target_code} != {"yor_Latn", "eng_Latn"}:
        raise ValueError("Only Yoruba-English translation pairs are supported.")

    tokenizer.src_lang = source_code
    encoded = tokenizer(text, add_special_tokens=True)
    source_tokens = tokenizer.convert_ids_to_tokens(encoded.input_ids)
    result = translator.translate_batch(
        [source_tokens],
        target_prefix=[[target_code]],
        max_decoding_length=256,
        beam_size=1,
    )[0]
    output_tokens = result.hypotheses[0][1:]
    output_ids = tokenizer.convert_tokens_to_ids(output_tokens)
    return tokenizer.decode(output_ids, skip_special_tokens=True).strip()


class NllbRequestHandler(BaseHTTPRequestHandler):
    """Handle readiness checks and JSON translation requests."""

    tokenizer: Any
    translator: Any

    def do_GET(self) -> None:
        if self.path != "/health":
            self._send_json(404, {"error": "not found"})
            return

        self._send_json(200, {"status": "ready", "model": MODEL_PATH.name})

    def do_POST(self) -> None:
        if self.path != "/translate":
            self._send_json(404, {"error": "not found"})
            return

        try:
            request_length = int(self.headers.get("Content-Length", "0"))
            if request_length <= 0 or request_length > 32_768:
                raise ValueError("request body must be between 1 and 32768 bytes")

            request = json.loads(self.rfile.read(request_length))
            text = request.get("text")
            source_language = request.get("source_lang")
            target_language = request.get("target_lang")
            if not all(
                isinstance(value, str) and value.strip()
                for value in (text, source_language, target_language)
            ):
                raise ValueError("text, source_lang, and target_lang are required")

            with MODEL_LOCK:
                translation = translate_text(
                    self.tokenizer,
                    self.translator,
                    text.strip(),
                    source_language,
                    target_language,
                )
            self._send_json(200, {"translation": translation})
        except (json.JSONDecodeError, ValueError) as error:
            self._send_json(400, {"error": str(error)})
        # Keep the local service alive after inference errors.
        except Exception as error:
            print(f"NLLB inference failed: {error}", flush=True)
            self._send_json(500, {"error": "translation failed"})

    def _send_json(self, status: int, payload: dict[str, str]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, message: str, *args: Any) -> None:
        print(f"NLLB {self.address_string()} {message % args}", flush=True)


def main() -> None:
    """Load model before binding localhost so startup failures are explicit."""
    print(f"Loading local NLLB model from {MODEL_PATH}", flush=True)
    tokenizer, translator = load_model()
    NllbRequestHandler.tokenizer = tokenizer
    NllbRequestHandler.translator = translator
    server = ThreadingHTTPServer((HOST, PORT), NllbRequestHandler)
    print(f"NLLB service ready at http://{HOST}:{PORT}/translate", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
