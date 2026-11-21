"""Create the initial immutable L5 source inventory; refuses to overwrite it."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
legal = root / "docs" / "legal"
destination = legal / "locales" / "manifest.json"
if destination.exists():
    raise SystemExit("Refusing to overwrite the frozen source manifest")

core = {"TERMS_DRAFT.md", "PRIVACY_POLICY_DRAFT.md", "COMMUNITY_GUIDELINES_DRAFT.md"}
specialized = {
    "ORGANIZATION_AND_REPRESENTATIVE_POLICY_DRAFT.md",
    "PROJECT_AND_VOLUNTEER_POLICY_DRAFT.md",
    "VOTING_AND_POLLING_POLICY_DRAFT.md",
    "VERIFICATION_AND_BADGES_POLICY_DRAFT.md",
    "EARLY_PARTNER_PROGRAM_POLICY_DRAFT.md",
    "COOKIE_AND_TRACKING_NOTICE_DRAFT.md",
    "DATA_RIGHTS_AND_RETENTION_POLICY_DRAFT.md",
}
commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
documents = []
for path in sorted(legal.rglob("*.md")):
    if "locales" in path.parts or path.name.startswith("L5_"):
        continue
    if path.name in core:
        cls = "public_core"
    elif path.name in specialized:
        cls = "public_specialized"
    elif path.name == "FUTURE_CAPABILITIES_POLICY_ANNEX.md":
        cls = "future_proposal"
    elif "governance" in path.parts:
        cls = "internal_governance"
    else:
        cls = "editorial_research"
    body = path.read_text(encoding="utf-8")
    document_id = path.stem.lower().replace("_draft", "")
    documents.append({
        "id": document_id,
        "class": cls,
        "source_path": path.relative_to(root).as_posix(),
        "source_sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
        "source_commit": commit,
        "editorial_version": "L4-working-1",
        "source_status": "draft_not_approved",
        "source_language": "en",
        "proposed_audience": "public" if cls.startswith("public_") else "internal",
        "approval_blockers": ["L4-31", "owner_and_qualified_legal_review"],
        "target_locales": ["ht", "fr", "es"] if cls.startswith("public_") else [],
        "translation_status": "pending",
        "last_synchronized_revision": None,
        "section_ids": re.findall(r"^## ([0-9]+)\.", body, re.MULTILINE),
        "placeholder_count": len(re.findall(r"\[[^\]\n]*(?:Approval required|approved [^\]\n]*contact)[^\]\n]*\]", body, re.IGNORECASE)),
        "known_unresolved_placeholders": re.findall(r"\[[^\]\n]*(?:Approval required|approved [^\]\n]*contact)[^\]\n]*\]", body, re.IGNORECASE),
    })
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps({"schema_version": 1, "snapshot_commit": commit, "documents": documents}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Frozen {len(documents)} English documents at {commit}")
