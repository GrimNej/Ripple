"""Verify every disclosed benchmark file against the committed fixture manifest."""

from __future__ import annotations

import json
from hashlib import sha256
from pathlib import Path
from typing import Any, cast

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = PROJECT_ROOT / "benchmark" / "manifest.json"


def _sha256(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(64 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _safe_path(relative_path: str) -> Path:
    candidate = (PROJECT_ROOT / relative_path).resolve()
    if PROJECT_ROOT not in candidate.parents:
        raise ValueError("MANIFEST_PATH_OUTSIDE_PROJECT")
    return candidate


def verify_fixture_manifest() -> dict[str, object]:
    """Raise on any drift and return a sanitized verification summary."""

    manifest = cast(dict[str, Any], json.loads(MANIFEST_PATH.read_text(encoding="utf-8")))
    records: list[dict[str, Any]] = []
    records.extend(cast(list[dict[str, Any]], manifest["sources"]))
    records.extend(cast(list[dict[str, Any]], manifest["assets"]))
    records.append(cast(dict[str, Any], manifest["labels"]))

    paths: set[str] = set()
    identifiers: set[str] = set()
    for record in records:
        relative_path = cast(str, record["path"])
        if relative_path in paths:
            raise ValueError("DUPLICATE_MANIFEST_PATH")
        paths.add(relative_path)
        for id_key in ("snapshotId", "assetId"):
            if id_key in record:
                identifier = cast(str, record[id_key])
                if identifier in identifiers:
                    raise ValueError("DUPLICATE_MANIFEST_IDENTIFIER")
                identifiers.add(identifier)

        path = _safe_path(relative_path)
        if not path.is_file():
            raise ValueError("MANIFEST_FILE_MISSING")
        expected_size = cast(int, record["byteSize"])
        expected_hash = cast(
            str, record.get("rawSha256", record.get("contentSha256", record.get("sha256")))
        )
        if path.stat().st_size != expected_size:
            raise ValueError("MANIFEST_SIZE_MISMATCH")
        if _sha256(path) != expected_hash:
            raise ValueError("MANIFEST_HASH_MISMATCH")

    return {
        "fileCount": len(records),
        "manifestSha256": _sha256(MANIFEST_PATH),
        "ok": True,
        "scenarioId": manifest["scenarioId"],
    }


if __name__ == "__main__":
    print(json.dumps(verify_fixture_manifest(), separators=(",", ":"), sort_keys=True))
