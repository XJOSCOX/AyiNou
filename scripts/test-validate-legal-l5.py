"""Adversarial checks for the frozen L5 source validator; never edits real drafts."""

from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("legal_l5_validator", ROOT / "scripts" / "validate-legal-l5.py")
assert SPEC and SPEC.loader
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


class FrozenSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((ROOT / "docs/legal/locales/manifest.json").read_text(encoding="utf-8"))
        cls.public = [record for record in cls.manifest["documents"] if record["class"] in ("public_core", "public_specialized")]
        cls.blobs = {}
        for record in cls.public:
            key = f"{record['source_commit']}:{record['source_path']}"
            cls.blobs[key] = subprocess.check_output(["git", "show", key], cwd=ROOT)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT / "docs" / "legal", self.root / "docs" / "legal")
        shutil.copytree(ROOT / "docs" / "privacy", self.root / "docs" / "privacy")
        self.previous = (validator.ROOT, validator.LEGAL, validator.MANIFEST)
        validator.ROOT = self.root
        validator.LEGAL = self.root / "docs" / "legal"
        validator.MANIFEST = validator.LEGAL / "locales" / "manifest.json"
        self.addCleanup(self.restore)

    def restore(self):
        validator.ROOT, validator.LEGAL, validator.MANIFEST = self.previous

    def git_show(self, args, **_kwargs):
        return subprocess.CompletedProcess(args, 0, self.blobs[args[2]], b"")

    def validate(self):
        output = io.StringIO()
        with patch.object(validator.subprocess, "run", side_effect=self.git_show), patch.object(sys, "argv", ["validate-legal-l5.py"]), contextlib.redirect_stdout(output):
            code = validator.main()
        return code, json.loads(output.getvalue())

    def test_original_blobs_match_frozen_hashes(self):
        for record in self.public:
            raw = self.blobs[f"{record['source_commit']}:{record['source_path']}"]
            # The actual Git blobs are LF, and their raw digests match the manifest.
            self.assertNotIn(b"\r\n", raw)
            self.assertEqual(hashlib.sha256(raw).hexdigest(), record["source_sha256"])
        code, result = self.validate()
        self.assertEqual(code, 0, result["errors"])
        self.assertEqual(result["errors"], [])
        self.assertEqual(result["missing"], [])

    def test_changed_historical_blob_is_rejected(self):
        record = self.public[0]
        key = f"{record['source_commit']}:{record['source_path']}"
        self.blobs = dict(self.blobs, **{key: self.blobs[key] + b"changed content"})
        code, result = self.validate()
        self.assertEqual(code, 1)
        self.assertIn(f"snapshot hash mismatch: {record['id']}", result["errors"])

    def test_missing_history_is_not_called_a_hash_mismatch(self):
        record = self.public[0]
        with patch.object(validator.subprocess, "run", return_value=subprocess.CompletedProcess([], 128, b"", b"missing")):
            self.assertEqual(validator.historical_snapshot_error(record), f"snapshot unavailable: {record['id']} (fetch full Git history)")

    def test_tampered_manifest_hash_is_rejected_without_rewriting_it(self):
        manifest = json.loads(validator.MANIFEST.read_text(encoding="utf-8"))
        record = next(item for item in manifest["documents"] if item["id"] == self.public[0]["id"])
        record["source_sha256"] = "0" * 64
        validator.MANIFEST.write_text(json.dumps(manifest), encoding="utf-8")
        code, result = self.validate()
        self.assertEqual(code, 1)
        self.assertIn(f"snapshot hash mismatch: {record['id']}", result["errors"])
        self.assertEqual(json.loads((ROOT / "docs/legal/locales/manifest.json").read_text(encoding="utf-8")), self.manifest)

    def test_changed_working_source_and_missing_documents_are_rejected(self):
        record = self.public[0]
        source = self.root / record["source_path"]
        source.write_bytes(source.read_bytes() + b"\nchanged content")
        code, result = self.validate()
        self.assertEqual(code, 1)
        self.assertIn(f"source changed: {record['id']}", result["errors"])
        source.unlink()
        code, result = self.validate()
        self.assertEqual(code, 1)
        self.assertTrue(any(item.startswith("missing source:") for item in result["errors"]))
        source.write_bytes((ROOT / record["source_path"]).read_bytes())
        target = self.root / "docs/legal/locales/ht" / source.name
        target.unlink()
        code, result = self.validate()
        self.assertEqual(code, 1)
        self.assertIn(f"ht/{source.name}", result["missing"])

    def test_translation_structure_placeholders_and_draft_marker_stay_enforced(self):
        record = self.public[0]
        target = self.root / "docs/legal/locales/ht" / Path(record["source_path"]).name
        original = target.read_text(encoding="utf-8")
        for altered, expected in (
            (original.replace("## 1.", "## 99.", 1), "section mismatch:"),
            (original.replace("[Approval required", "[Changed", 1), "placeholder mismatch:"),
            (original.replace("DRAFT — NOT APPROVED FOR PUBLICATION", "", 1), "missing draft marker:"),
        ):
            target.write_text(altered, encoding="utf-8")
            code, result = self.validate()
            self.assertEqual(code, 1)
            self.assertTrue(any(item.startswith(expected) for item in result["errors"]), result["errors"])


if __name__ == "__main__":
    unittest.main()
