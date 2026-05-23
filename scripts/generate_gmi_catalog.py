#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path("/Users/gratitud3/Downloads/llm.txt")
OUTPUT = ROOT / "shared" / "generated" / "gmi-model-catalog.ts"

PROVIDER_RE = re.compile(r"^##\s+(.+?)\s*$", re.M)
MODEL_RE = re.compile(
    r"- \*\*Endpoint\*\*: `([^`]+)`\s+"
    r"\*\*Category\*\*: ([^\n]+?)\s+"
    r"\*\*Description\*\*: ([^\n]+?)\s+"
    r"\*\*Pricing\*\*: ([^\n]+?)\s+"
    r"\*\*API Example\*\*:\s*```bash\n(.*?)```",
    re.S | re.M,
)
JSON_KEY_RE = re.compile(r'"([A-Za-z_][A-Za-z0-9_]*)"\s*:')
STRING_VALUE_RE = re.compile(r'"%s"\s*:\s*"([^"]+)"')
NUMBER_VALUE_RE = re.compile(r'"%s"\s*:\s*([0-9]+(?:\.[0-9]+)?)')
BOOLEAN_VALUE_RE = re.compile(r'"%s"\s*:\s*(true|false)')

CANONICAL_ID_OVERRIDES = {
    "google/gemini-3.1-flash-lite-preview": "gmi/gemini-3.1-flash-lite",
    "deepseek-ai/DeepSeek-R1-0528": "gmi/deepseek-r1",
    "openai/gpt-4o-mini": "gmi/openai-o4-mini",
    "gemini-3.1-flash-image-preview": "gmi/gemini-3.1-flash-image-preview",
    "seedream-5-0-lite": "gmi/seedream-5.0-lite",
    "Kling-Image2Video-V2.1-Master": "gmi/kling-i2v-v2.1-master",
    "wan2.6-t2v": "gmi/wan2.6-t2v",
    "minimax-hailuo-2.3-fast": "gmi/minimax-hailuo-2.3",
    "veo-3": "gmi/veo3",
    "veo-3-fast": "gmi/veo3-fast",
    "GMI-MiniMeTalks-Workflow": "gmi/minime-talks-workflow",
}

LEGACY_ALIASES = {
    "google/gemini-3.1-flash-lite-preview": ["gmi/google-gemini-3.1-flash-lite-preview"],
    "deepseek-ai/DeepSeek-R1-0528": ["gmi/deepseek-ai-deepseek-r1-0528"],
    "openai/gpt-4o-mini": ["gmi/openai-gpt-4o-mini"],
    "seedream-5-0-lite": ["gmi/seedream-5-0-lite", "gmi/seedream-5.0"],
    "Kling-Image2Video-V2.1-Master": ["gmi/kling-image2video-v2.1-master"],
    "wan2.6-t2v": ["gmi/wan-2.6-t2v"],
    "minimax-hailuo-2.3-fast": ["gmi/minimax-hailuo-2.3-fast"],
    "veo-3": ["gmi/veo-3"],
    "veo-3-fast": ["gmi/veo-3-fast"],
    "GMI-MiniMeTalks-Workflow": ["gmi/gmi-minime-talks-workflow"],
}

ASPECT_RATIO_OPTIONS = ["1:1", "3:4", "4:3", "16:9", "9:16"]
RESOLUTION_OPTIONS = ["720p", "1080p", "1440p", "2160p", "2K", "3K", "4K", "1920x1080", "2560x1440", "3840x2160"]
LANGUAGE_OPTIONS = ["en", "es", "fr", "de", "ja", "ko", "zh"]
OUTPUT_FORMAT_OPTIONS = ["png", "jpeg", "jpg", "webp", "mp4", "mp3", "wav"]


def slugify(value: str) -> str:
    value = value.strip().lower().replace("&", " and ")
    value = re.sub(r"[/.]+", "-", value)
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-{2,}", "-", value).strip("-")
    return value


def title_case_from_endpoint(endpoint: str) -> str:
    if "/" in endpoint:
        endpoint = endpoint.split("/")[-1]
    pieces = re.split(r"[-_.]+", endpoint)
    cleaned = [piece for piece in pieces if piece]
    if not cleaned:
        return endpoint
    return " ".join(
        piece.upper() if piece.isupper() or piece.isdigit() else piece.capitalize()
        for piece in cleaned
    )


def nearest_provider(text: str, index: int) -> str:
    provider = "GMI"
    for match in PROVIDER_RE.finditer(text, 0, index):
        provider = match.group(1).strip()
    return provider


def extract_keys(api_example: str) -> list[str]:
    keys = []
    seen = set()
    for key in JSON_KEY_RE.findall(api_example):
        if key in {"model", "payload", "messages", "role", "content", "system", "user"}:
            continue
        if key in seen:
            continue
        seen.add(key)
        keys.append(key)
    return keys


def extract_string(api_example: str, key: str) -> str | None:
    match = re.search(STRING_VALUE_RE.pattern % re.escape(key), api_example)
    return match.group(1) if match else None


def extract_number(api_example: str, key: str) -> int | float | None:
    match = re.search(NUMBER_VALUE_RE.pattern % re.escape(key), api_example)
    if not match:
        return None
    value = float(match.group(1))
    return int(value) if value.is_integer() else value


def extract_boolean(api_example: str, key: str) -> bool | None:
    match = re.search(BOOLEAN_VALUE_RE.pattern % re.escape(key), api_example)
    if not match:
        return None
    return match.group(1) == "true"


def infer_media_type(category: str) -> str:
    normalized = category.strip().lower()
    return {
        "llm": "text",
        "image": "image",
        "video": "video",
        "audio": "audio",
    }.get(normalized, "text")


def infer_workflow(endpoint: str, description: str, media_type: str, payload_keys: list[str]) -> str:
    haystack = f"{endpoint} {description}".lower()
    key_set = set(payload_keys)

    if media_type == "text":
        return "text-to-text"

    if media_type == "image":
        if any(token in haystack for token in ["upscale", "inpaint", "background", "product", "remove"]):
            return "image-to-image"
        if {"image", "image_url", "image_urls"} & key_set:
            return "image-to-image"
        return "text-to-image"

    if media_type == "video":
        if {"audio", "audio_url"} & key_set and {"video", "video_url"} & key_set:
            return "lip-sync"
        if {"audio", "audio_url"} & key_set and {"image", "image_url"} & key_set:
            return "talking-head"
        if any(token in haystack for token in ["image2video", "i2v"]) or {"image", "image_url", "lastFrame"} & key_set:
            return "image-to-video"
        if "element" in haystack:
            return "element-generation"
        return "text-to-video"

    if any(token in haystack for token in ["speech-to-text", "transcribe", "transcription"]):
        return "speech-to-text"
    if "voice-design" in haystack:
        return "voice-design"
    if {"voice_sample", "speaker_audio", "reference_audio", "audio_url"} & key_set:
        return "voice-clone"
    if any(token in haystack for token in ["music", "song", "sfx", "sound effect"]):
        return "text-to-audio"
    return "text-to-speech"


def infer_requires_assets(media_type: str, workflow_type: str, payload_keys: list[str]) -> list[str]:
    requires = []
    key_set = set(payload_keys)
    if workflow_type in {"image-to-image", "image-to-video", "talking-head"} or {"image", "image_url", "image_urls"} & key_set:
        requires.append("image")
    if workflow_type == "lip-sync" or {"video", "video_url"} & key_set:
        requires.append("video")
    if workflow_type in {"talking-head", "lip-sync", "voice-clone", "speech-to-text"} or {"audio", "audio_url", "voice_sample"} & key_set:
        requires.append("audio")
    if media_type == "audio" and workflow_type == "voice-clone" and "audio" not in requires:
        requires.append("audio")
    return requires


def infer_ui_group(workflow_type: str, description: str) -> str:
    if workflow_type in {"image-to-image", "speech-to-text", "voice-design", "audio-to-audio"}:
        return "advanced"
    if any(token in description.lower() for token in ["utility", "analysis", "retouch", "background removal", "upscale"]):
        return "advanced"
    return "generation"


def infer_defaults(api_example: str, payload_keys: list[str]) -> dict[str, Any]:
    defaults: dict[str, Any] = {}
    for key in ("aspectRatio", "aspect_ratio", "durationSeconds", "duration_seconds", "duration", "resolution", "speed", "language", "output_format", "fps"):
        if key not in payload_keys:
            continue
        string_value = extract_string(api_example, key)
        if string_value is not None:
            defaults[key] = string_value
            continue
        numeric_value = extract_number(api_example, key)
        if numeric_value is not None:
            defaults[key] = numeric_value
    for key in ("generateAudio", "generate_audio", "watermark"):
        if key in payload_keys:
            boolean_value = extract_boolean(api_example, key)
            if boolean_value is not None:
                defaults[key] = boolean_value
    return defaults


def infer_supports(media_type: str, workflow_type: str, payload_keys: list[str]) -> list[str]:
    supports: list[str] = []
    if media_type in {"text", "image", "video", "audio"}:
        supports.append("prompt")
    if workflow_type == "text-to-text":
        supports.extend(["messages", "max_tokens", "temperature"])
    if workflow_type in {"image-to-image", "image-to-video", "talking-head"}:
        supports.extend(["image_url", "image_urls"])
    if workflow_type == "lip-sync":
        supports.append("video_url")
    if media_type == "audio":
        supports.extend(["text", "audio_url"])
    control_keys = [key for key in payload_keys if key not in {"prompt", "image", "image_url", "image_urls", "video", "video_url", "audio", "audio_url"}]
    supports.extend(control_keys)
    seen = set()
    ordered = []
    for item in supports:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered


def infer_controls(payload_keys: list[str], defaults: dict[str, Any]) -> list[dict[str, Any]]:
    controls: list[dict[str, Any]] = []
    key_set = set(payload_keys)
    if "aspectRatio" in key_set or "aspect_ratio" in key_set:
        key = "aspectRatio" if "aspectRatio" in key_set else "aspect_ratio"
        controls.append(
            {
                "key": key,
                "label": "Aspect Ratio",
                "type": "select",
                "defaultValue": defaults.get(key, "16:9"),
                "options": [{"label": option, "value": option} for option in ASPECT_RATIO_OPTIONS],
            }
        )
    for key in ("durationSeconds", "duration_seconds", "duration"):
        if key in key_set:
            controls.append(
                {
                    "key": key,
                    "label": "Duration",
                    "type": "number",
                    "defaultValue": defaults.get(key, 5),
                    "min": 1,
                    "max": 30,
                    "step": 1,
                }
            )
            break
    for key in ("resolution",):
        if key in key_set:
            controls.append(
                {
                    "key": key,
                    "label": "Resolution",
                    "type": "select",
                    "defaultValue": defaults.get(key, RESOLUTION_OPTIONS[1]),
                    "options": [{"label": option, "value": option} for option in RESOLUTION_OPTIONS],
                }
            )
    for key in ("generateAudio", "generate_audio"):
        if key in key_set:
            controls.append(
                {
                    "key": key,
                    "label": "Generate Audio",
                    "type": "boolean",
                    "defaultValue": defaults.get(key, False),
                }
            )
            break
    if "language" in key_set:
        controls.append(
            {
                "key": "language",
                "label": "Language",
                "type": "select",
                "defaultValue": defaults.get("language", "en"),
                "options": [{"label": option.upper(), "value": option} for option in LANGUAGE_OPTIONS],
            }
        )
    if "speed" in key_set:
        controls.append(
            {
                "key": "speed",
                "label": "Speed",
                "type": "number",
                "defaultValue": defaults.get("speed", 1.0),
                "min": 0.25,
                "max": 2.0,
                "step": 0.05,
            }
        )
    if "output_format" in key_set:
        controls.append(
            {
                "key": "output_format",
                "label": "Output Format",
                "type": "select",
                "defaultValue": defaults.get("output_format", "png"),
                "options": [{"label": option.upper(), "value": option} for option in OUTPUT_FORMAT_OPTIONS],
            }
        )
    return controls


def infer_time(media_type: str, workflow_type: str, endpoint: str) -> str:
    endpoint_lower = endpoint.lower()
    if media_type == "text":
        return "~3s"
    if media_type == "audio":
        return "~12s" if workflow_type in {"voice-clone", "text-to-audio"} else "~6s"
    if media_type == "image":
        return "~8s" if "lite" in endpoint_lower else "~12s"
    return "~45s" if "fast" in endpoint_lower or "lite" in endpoint_lower else "~70s"


def infer_sort_rank(endpoint: str, media_type: str, workflow_type: str) -> int:
    endpoint_lower = endpoint.lower()
    rank = {
        "text": 100,
        "image": 200,
        "video": 300,
        "audio": 400,
    }.get(media_type, 900)
    if endpoint in CANONICAL_ID_OVERRIDES:
        rank -= 50
    if workflow_type in {"text-to-text", "text-to-image", "text-to-video", "text-to-speech"}:
        rank -= 10
    if "lite" in endpoint_lower or "fast" in endpoint_lower or "mini" in endpoint_lower:
        rank -= 5
    return rank


def build_entry(provider: str, endpoint: str, category: str, description: str, pricing: str, api_example: str) -> dict[str, Any]:
    media_type = infer_media_type(category)
    payload_keys = extract_keys(api_example)
    workflow_type = infer_workflow(endpoint, description, media_type, payload_keys)
    defaults = infer_defaults(api_example, payload_keys)
    canonical_id = CANONICAL_ID_OVERRIDES.get(endpoint, f"gmi/{slugify(endpoint)}")
    aliases = sorted(
        {
            endpoint,
            f"gmi/{slugify(endpoint)}",
            *LEGACY_ALIASES.get(endpoint, []),
        }
        - {canonical_id}
    )
    return {
        "id": canonical_id,
        "endpointId": endpoint,
        "provider": "gmi-cloud",
        "providerLabel": provider,
        "name": title_case_from_endpoint(endpoint),
        "description": description,
        "category": category,
        "pricingText": pricing,
        "transport": "chat_completion" if "chat/completions" in api_example else "request_queue",
        "mediaType": media_type,
        "workflowType": workflow_type,
        "uiGroup": infer_ui_group(workflow_type, description),
        "supports": infer_supports(media_type, workflow_type, payload_keys),
        "payloadKeys": payload_keys,
        "requiresAssets": infer_requires_assets(media_type, workflow_type, payload_keys),
        "defaults": defaults,
        "controls": infer_controls(payload_keys, defaults),
        "aliases": aliases,
        "enabled": True,
        "credits": 0,
        "time": infer_time(media_type, workflow_type, endpoint),
        "sortRank": infer_sort_rank(endpoint, media_type, workflow_type),
        "rawApiExample": api_example.strip(),
    }


def parse_source(text: str) -> list[dict[str, Any]]:
    entries = []
    for match in MODEL_RE.finditer(text):
        provider = nearest_provider(text, match.start())
        entries.append(
            build_entry(
                provider=provider,
                endpoint=match.group(1).strip(),
                category=match.group(2).strip(),
                description=match.group(3).strip(),
                pricing=match.group(4).strip(),
                api_example=match.group(5),
            )
        )
    return entries


def render_typescript(entries: list[dict[str, Any]], source: Path) -> str:
    payload = json.dumps(entries, indent=2, ensure_ascii=False)
    return (
        "/* eslint-disable */\n"
        f"// Generated by scripts/generate_gmi_catalog.py from {source}\n\n"
        "export type GeneratedGmiMediaType = 'text' | 'image' | 'video' | 'audio';\n"
        "export type GeneratedGmiTransport = 'chat_completion' | 'request_queue';\n"
        "export type GeneratedGmiUiGroup = 'generation' | 'advanced';\n\n"
        "export interface GeneratedGmiControlOption {\n"
        "  label: string;\n"
        "  value: string | number | boolean;\n"
        "}\n\n"
        "export interface GeneratedGmiControlDefinition {\n"
        "  key: string;\n"
        "  label: string;\n"
        "  type: 'select' | 'number' | 'boolean';\n"
        "  defaultValue?: string | number | boolean;\n"
        "  options?: GeneratedGmiControlOption[];\n"
        "  min?: number;\n"
        "  max?: number;\n"
        "  step?: number;\n"
        "}\n\n"
        "export interface GeneratedGmiCatalogEntry {\n"
        "  id: string;\n"
        "  endpointId: string;\n"
        "  provider: 'gmi-cloud';\n"
        "  providerLabel: string;\n"
        "  name: string;\n"
        "  description: string;\n"
        "  category: string;\n"
        "  pricingText: string;\n"
        "  transport: GeneratedGmiTransport;\n"
        "  mediaType: GeneratedGmiMediaType;\n"
        "  workflowType: string;\n"
        "  uiGroup: GeneratedGmiUiGroup;\n"
        "  supports: string[];\n"
        "  payloadKeys: string[];\n"
        "  requiresAssets: Array<'image' | 'video' | 'audio'>;\n"
        "  defaults: Record<string, unknown>;\n"
        "  controls: GeneratedGmiControlDefinition[];\n"
        "  aliases: string[];\n"
        "  enabled: boolean;\n"
        "  credits: number;\n"
        "  time: string;\n"
        "  sortRank: number;\n"
        "  rawApiExample: string;\n"
        "}\n\n"
        f"export const GENERATED_GMI_MODEL_CATALOG: GeneratedGmiCatalogEntry[] = {payload} as GeneratedGmiCatalogEntry[];\n"
    )


def main() -> int:
    source = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else DEFAULT_SOURCE
    text = source.read_text()
    entries = parse_source(text)
    if len(entries) != 115:
        raise SystemExit(f"Expected 115 models from {source}, found {len(entries)}")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(render_typescript(entries, source))
    print(f"Wrote {len(entries)} models to {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
