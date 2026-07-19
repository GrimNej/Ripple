"""Verify immutable forward/rollback migration pairs against their manifest."""

from __future__ import annotations

import json
from hashlib import sha256
from pathlib import Path
from typing import Any, cast

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MIGRATION_ROOT = PROJECT_ROOT / "snowflake" / "migrations"
MANIFEST_PATH = MIGRATION_ROOT / "manifest.json"


def _sha256(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def verify_migration_manifest() -> dict[str, object]:
    """Reject missing pairs, non-contiguous order, or migration content drift."""

    manifest = cast(dict[str, Any], json.loads(MANIFEST_PATH.read_text(encoding="utf-8")))
    migrations = cast(list[dict[str, Any]], manifest["migrations"])
    for index, migration in enumerate(migrations, start=1):
        if migration["order"] != index:
            raise ValueError("MIGRATION_ORDER_NOT_CONTIGUOUS")
        forward = MIGRATION_ROOT / "forward" / cast(str, migration["forwardFilename"])
        rollback = MIGRATION_ROOT / "rollback" / cast(str, migration["rollbackFilename"])
        if not forward.is_file() or not rollback.is_file():
            raise ValueError("MIGRATION_PAIR_MISSING")
        if _sha256(forward) != migration["forwardSha256"]:
            raise ValueError("FORWARD_MIGRATION_HASH_MISMATCH")
        if _sha256(rollback) != migration["rollbackSha256"]:
            raise ValueError("ROLLBACK_MIGRATION_HASH_MISMATCH")

    actual_forward = {path.name for path in (MIGRATION_ROOT / "forward").glob("*.sql")}
    actual_rollback = {path.name for path in (MIGRATION_ROOT / "rollback").glob("*.sql")}
    listed_forward = {cast(str, row["forwardFilename"]) for row in migrations}
    listed_rollback = {cast(str, row["rollbackFilename"]) for row in migrations}
    if actual_forward != listed_forward or actual_rollback != listed_rollback:
        raise ValueError("UNLISTED_MIGRATION_FILE")

    return {
        "manifestSha256": _sha256(MANIFEST_PATH),
        "migrationCount": len(migrations),
        "ok": True,
    }


if __name__ == "__main__":
    print(json.dumps(verify_migration_manifest(), separators=(",", ":"), sort_keys=True))
