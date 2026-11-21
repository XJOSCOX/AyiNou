"""Validate L5 legal drafts without granting approval or publishing them."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEGAL = ROOT / "docs" / "legal"
MANIFEST = LEGAL / "locales" / "manifest.json"
LOCALES = ("ht", "fr", "es")
HEAD = re.compile(r"^## ([0-9]+)\.", re.MULTILINE)
PLACEHOLDER = re.compile(r"\[[^\]\n]*(?:Approval required|approved [^\]\n]*contact)[^\]\n]*\]", re.IGNORECASE)
LINK = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")
METADATA = re.compile(r"^<!-- l5: (\{[^\n]+\}) -->", re.MULTILINE)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_text(encoding="utf-8").encode("utf-8")).hexdigest()


def historical_snapshot_error(record: dict) -> str | None:
    baseline = subprocess.run(
        ["git", "show", f"{record['source_commit']}:{record['source_path']}"],
        cwd=ROOT, capture_output=True, check=False,
    )
    if baseline.returncode:
        return f"snapshot unavailable: {record['id']} (fetch full Git history)"
    if hashlib.sha256(baseline.stdout).hexdigest() != record["source_sha256"]:
        return f"snapshot hash mismatch: {record['id']}"
    return None


def section_ids(body: str) -> list[str]:
    return HEAD.findall(body)


def placeholders(body: str) -> list[str]:
    return PLACEHOLDER.findall(body)


def bad_links(path: Path, body: str) -> list[str]:
    errors = []
    for href in LINK.findall(body):
        if href.startswith(("http:", "https:", "mailto:")):
            continue
        target, _, anchor = href.partition("#")
        dest = (path.parent / target).resolve() if target else path
        if not dest.is_file():
            errors.append(f"{path.relative_to(ROOT)}: missing link {href}")
        elif anchor and anchor not in {slug(h) for h in re.findall(r"^#{1,6} (.+)$", dest.read_text(encoding="utf-8"), re.MULTILINE)}:
            errors.append(f"{path.relative_to(ROOT)}: missing anchor {href}")
    return errors


def slug(heading: str) -> str:
    return re.sub(r"[^\w\- ]", "", heading.lower()).replace(" ", "-")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write-manifest", action="store_true")
    parser.add_argument("--allow-incomplete", action="store_true", help="Check existing drafts while reporting missing documents separately")
    args = parser.parse_args()
    if args.write_manifest:
        raise SystemExit("Source snapshots are immutable; create a reviewed new manifest version.")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    errors: list[str] = []
    missing: list[str] = []
    coverage: dict[str, list[str]] = {locale: [] for locale in LOCALES}
    for record in manifest["documents"]:
        source = ROOT / record["source_path"]
        if not source.is_file():
            errors.append(f"missing source: {source}")
            continue
        body = source.read_text(encoding="utf-8")
        if record["class"] not in ("public_core", "public_specialized"):
            continue
        snapshot_error = historical_snapshot_error(record)
        if snapshot_error:
            errors.append(snapshot_error)
        if sha(source) != record["source_sha256"]:
            errors.append(f"source changed: {record['id']}")
        if section_ids(body) != record["section_ids"]:
            errors.append(f"source section mismatch: {record['id']}")
        if len(placeholders(body)) != record["placeholder_count"]:
            errors.append(f"source placeholders changed: {record['id']}")
        errors.extend(bad_links(source, body))
        for locale in LOCALES:
            target = LEGAL / "locales" / locale / source.name
            if not target.is_file():
                missing.append(f"{locale}/{source.name}")
                continue
            translated = target.read_text(encoding="utf-8")
            coverage[locale].append(record["id"])
            match = METADATA.search(translated)
            if not match:
                errors.append(f"missing metadata: {locale}/{source.name}")
                continue
            try:
                meta = json.loads(match.group(1))
            except json.JSONDecodeError:
                errors.append(f"invalid metadata: {locale}/{source.name}")
                continue
            if (meta.get("id"), meta.get("locale"), meta.get("source_sha256")) != (record["id"], locale, record["source_sha256"]):
                errors.append(f"metadata/source mismatch: {locale}/{source.name}")
            if meta.get("review") != "pending" or "approved" in str(meta.get("version", "")).lower():
                errors.append(f"unsupported review claim: {locale}/{source.name}")
            for marker in ("DRAFT — NOT APPROVED FOR PUBLICATION", "TRANSLATION DRAFT — QUALIFIED HUMAN AND LEGAL REVIEW REQUIRED"):
                if marker not in translated:
                    errors.append(f"missing draft marker: {locale}/{source.name}: {marker}")
            if section_ids(translated) != record["section_ids"]:
                errors.append(f"section mismatch: {locale}/{source.name}")
            for pattern, label in ((r"^### ", "subheading"), (r"^\| ", "table row"), (r"(?<!!)\[[^\]]+\]\([^)]+\)", "cross-reference")):
                if len(re.findall(pattern, translated, re.MULTILINE)) != len(re.findall(pattern, body, re.MULTILINE)):
                    errors.append(f"{label} mismatch: {locale}/{source.name}")
            if len(placeholders(translated)) != record["placeholder_count"]:
                errors.append(f"placeholder mismatch: {locale}/{source.name}")
            source_paragraphs = {p.strip() for p in body.split("\n\n") if len(p.strip()) > 180 and not p.lstrip().startswith(("|", "#"))}
            copied = source_paragraphs.intersection({p.strip() for p in translated.split("\n\n")})
            if copied:
                errors.append(f"untranslated source paragraph: {locale}/{source.name}")
            if re.search(r"(?m)^## \d+\.[^\n]*\n(?:\s|<!--[^\n]*-->)*## ", translated):
                errors.append(f"empty section: {locale}/{source.name}")
            errors.extend(bad_links(target, translated))
    print(json.dumps({"coverage": coverage, "missing": missing, "errors": errors}, ensure_ascii=False, indent=2))
    return 1 if errors or (missing and not args.allow_incomplete) else 0


if __name__ == "__main__":
    raise SystemExit(main())
