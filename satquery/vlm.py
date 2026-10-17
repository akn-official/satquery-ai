"""OpenAI-compatible VLM client. Same code for LITE (Ollama / llama.cpp on laptop) and MAIN (Kaggle)."""
import base64
import io
import math
import os
import re

import httpx
from PIL import Image

VLM_URL = os.getenv("VLM_URL", "http://localhost:11434/v1")  # Ollama; llama.cpp llama-server: http://localhost:8080/v1
VLM_MODEL = os.getenv("VLM_MODEL", "qwen3.5:2b")             # swap to the fine-tuned GGUF tag after M1
VLM_MAX_SIDE = int(os.getenv("VLM_MAX_SIDE", "448"))          # small images keep a 4 GB GPU happy
VLM_REASONING = os.getenv("VLM_REASONING", "none")            # qwen3.5 thinks by default: 200 tokens of thought, empty answer


class Offline(RuntimeError):
    """VLM server unreachable. Pipeline continues with tool evidence only."""


def _b64(rgb):
    im = Image.fromarray(rgb)
    im.thumbnail((VLM_MAX_SIDE, VLM_MAX_SIDE))
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


def ask(prompt, images, max_tokens=200):
    """-> (text, conf). conf = mean token probability, None if the server omits logprobs."""
    content = [{"type": "image_url", "image_url": {"url": "data:image/png;base64," + _b64(i)}} for i in images]
    content.append({"type": "text", "text": prompt})
    body = {"model": VLM_MODEL, "messages": [{"role": "user", "content": content}],
            "max_tokens": max(1, min(int(max_tokens), 1024)),  # tool params come from the client: cap the spend
            "temperature": 0, "logprobs": True,
            "reasoning_effort": VLM_REASONING}
    try:
        r = httpx.post(f"{VLM_URL}/chat/completions", json=body, timeout=180)
        r.raise_for_status()
    except httpx.HTTPError as e:
        raise Offline(f"VLM unreachable at {VLM_URL}: {e}") from e
    choice = r.json()["choices"][0]
    text = re.sub(r"<think>.*?</think>", "", choice["message"]["content"] or "", flags=re.S)
    text = re.sub(r"^[ \t]*[-*_]{3,}[ \t]*$|\*\*|__|^#+\s*|[\U0001F300-\U0001FAFF☀-➿]️?\s?", "", text, flags=re.M).strip()  # plain text
    if not text:
        raise RuntimeError(f"empty VLM answer (finish_reason={choice.get('finish_reason')})")
    lps = [t["logprob"] for t in ((choice.get("logprobs") or {}).get("content") or [])]
    return text, (round(math.exp(sum(lps) / len(lps)), 3) if lps else None)
