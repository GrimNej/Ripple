"""Upload, hash-verify, and seed Ripple's disclosed deterministic golden fixture."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from hashlib import sha256
from pathlib import Path
from typing import Any, cast

import snowflake.connector
from snowflake.connector import SnowflakeConnection
from snowflake.connector.cursor import SnowflakeCursor
from verify_hashes import PROJECT_ROOT, verify_fixture_manifest

MANIFEST_PATH = PROJECT_ROOT / "benchmark" / "manifest.json"
SAFE_STAGE_FILENAME = re.compile(r"^[A-Za-z0-9._-]+$")
MAX_ASSET_BYTES = 262_144


def _put_file(cursor: SnowflakeCursor, path: Path, stage: str) -> None:
    if not SAFE_STAGE_FILENAME.fullmatch(path.name):
        raise ValueError("UNSAFE_STAGE_FILENAME")
    with path.open("rb") as stream:
        cursor.execute(
            f"PUT file://ignored/{path.name} {stage} AUTO_COMPRESS = FALSE OVERWRITE = TRUE",
            file_stream=stream,
        )


def _parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _seed_source_rows(
    cursor: SnowflakeCursor, manifest: dict[str, Any], manifest_sha256: str
) -> None:
    cursor.execute(
        "INSERT INTO RIPPLE.RAW.FIXTURE_MANIFEST "
        "(scenario_id, manifest_sha256, manifest_variant) "
        "SELECT ?, ?, PARSE_JSON(?) WHERE NOT EXISTS ("
        "SELECT 1 FROM RIPPLE.RAW.FIXTURE_MANIFEST WHERE scenario_id = ? AND manifest_sha256 = ?)",
        (
            manifest["scenarioId"],
            manifest_sha256,
            json.dumps(manifest, separators=(",", ":"), sort_keys=True),
            manifest["scenarioId"],
            manifest_sha256,
        ),
    )
    source = cast(dict[str, Any], manifest["sources"][0])
    cursor.execute(
        "INSERT INTO RIPPLE.CORE.SOURCE "
        "(source_id, name, canonical_url, source_kind, active) "
        "SELECT ?, ?, ?, 'AUTHORITATIVE_DOC', TRUE WHERE NOT EXISTS ("
        "SELECT 1 FROM RIPPLE.CORE.SOURCE WHERE source_id = ?)",
        (
            source["sourceId"],
            "Acme Jobs documentation (synthetic)",
            "https://docs.ripple-fixture.invalid/jobs",
            source["sourceId"],
        ),
    )

    for snapshot in cast(list[dict[str, Any]], manifest["sources"]):
        path = PROJECT_ROOT / cast(str, snapshot["path"])
        _put_file(cursor, path, "@RIPPLE.RAW.FIXTURE_STAGE")
        cursor.execute(
            "INSERT INTO RIPPLE.CORE.SOURCE_SNAPSHOT "
            "(snapshot_id, source_id, version_label, artifact_stage_path, raw_sha256, "
            "content_type, byte_size, retrieved_at, fixture_disclosure, licence_basis, status) "
            "SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED' WHERE NOT EXISTS ("
            "SELECT 1 FROM RIPPLE.CORE.SOURCE_SNAPSHOT WHERE snapshot_id = ?)",
            (
                snapshot["snapshotId"],
                snapshot["sourceId"],
                snapshot["versionLabel"],
                path.name,
                snapshot["rawSha256"],
                snapshot["contentType"],
                snapshot["byteSize"],
                _parse_timestamp(cast(str, manifest["retrievedAt"])),
                manifest["disclosure"],
                manifest["licenceBasis"],
                snapshot["snapshotId"],
            ),
        )
        cursor.execute(
            "SELECT status FROM RIPPLE.CORE.SOURCE_SNAPSHOT WHERE snapshot_id = ?",
            (snapshot["snapshotId"],),
        )
        row = cursor.fetchone()
        if row is None:
            raise RuntimeError("SNAPSHOT_INSERT_FAILED")
        if row[0] == "RECEIVED":
            cursor.execute(
                "CALL RIPPLE.CORE.FINALIZE_SNAPSHOT(?, BUILD_SCOPED_FILE_URL("
                "@RIPPLE.RAW.FIXTURE_STAGE, ?))",
                (snapshot["snapshotId"], path.name),
            )
            result_row = cursor.fetchone()
            if result_row is None:
                raise RuntimeError("SNAPSHOT_FINALIZE_NO_RESULT")
            result = result_row[0]
            if isinstance(result, str):
                result = json.loads(result)
            if not isinstance(result, dict) or not result.get("ok"):
                raise RuntimeError("SNAPSHOT_FINALIZE_FAILED")
        elif row[0] != "FINALIZED":
            raise RuntimeError("SNAPSHOT_REQUIRES_NEW_ATTEMPT_ID")


def _seed_asset_rows(cursor: SnowflakeCursor, manifest: dict[str, Any]) -> None:
    labels = json.loads((PROJECT_ROOT / manifest["labels"]["path"]).read_text(encoding="utf-8"))
    authored_before_model = bool(labels["authoredBeforeModelExecution"])
    for asset in cast(list[dict[str, Any]], manifest["assets"]):
        content_bytes = (PROJECT_ROOT / cast(str, asset["path"])).read_bytes()
        if len(content_bytes) > MAX_ASSET_BYTES:
            raise ValueError("ASSET_TOO_LARGE")
        content = content_bytes.decode("utf-8", errors="strict")
        if sha256(content_bytes).hexdigest() != asset["contentSha256"]:
            raise ValueError("ASSET_HASH_MISMATCH")

        cursor.execute(
            "INSERT INTO RIPPLE.CORE.KNOWLEDGE_ASSET "
            "(asset_id, stable_key, asset_type, title, criticality) "
            "SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS ("
            "SELECT 1 FROM RIPPLE.CORE.KNOWLEDGE_ASSET WHERE asset_id = ?)",
            (
                asset["assetId"],
                asset["stableKey"],
                asset["assetType"],
                asset["title"],
                asset["criticality"],
                asset["assetId"],
            ),
        )
        metadata = {
            "contentType": asset["contentType"],
            "fixtureDisclosure": manifest["disclosure"],
            "licenceBasis": manifest["licenceBasis"],
        }
        cursor.execute(
            "INSERT INTO RIPPLE.CORE.ASSET_VERSION "
            "(asset_version_id, asset_id, version_label, content, content_sha256, "
            "metadata_variant, created_by) SELECT ?, ?, 'fixture-v1', ?, ?, PARSE_JSON(?), "
            "'fixture-seed' WHERE NOT EXISTS (SELECT 1 FROM RIPPLE.CORE.ASSET_VERSION "
            "WHERE asset_version_id = ?)",
            (
                asset["versionId"],
                asset["assetId"],
                content,
                asset["contentSha256"],
                json.dumps(metadata, separators=(",", ":"), sort_keys=True),
                asset["versionId"],
            ),
        )
        cursor.execute(
            "UPDATE RIPPLE.CORE.KNOWLEDGE_ASSET SET current_version_id = ?, "
            "updated_at = CURRENT_TIMESTAMP(), row_version = row_version + 1 "
            "WHERE asset_id = ? AND current_version_id IS NULL",
            (asset["versionId"], asset["assetId"]),
        )
        if "sourceSectionKey" in asset:
            dependency_id = f"dependency-{asset['assetId']}"
            cursor.execute(
                "INSERT INTO RIPPLE.CORE.EXPLICIT_DEPENDENCY "
                "(dependency_id, source_section_key, asset_id, dependency_kind, basis) "
                "SELECT ?, ?, ?, 'FIXTURE_GROUND_TRUTH', 'Pre-authored benchmark dependency' "
                "WHERE NOT EXISTS (SELECT 1 FROM RIPPLE.CORE.EXPLICIT_DEPENDENCY "
                "WHERE dependency_id = ?)",
                (
                    dependency_id,
                    asset["sourceSectionKey"],
                    asset["assetId"],
                    dependency_id,
                ),
            )
        cursor.execute(
            "INSERT INTO RIPPLE.EVAL.BENCHMARK_LABEL "
            "(scenario_id, asset_id, expected_status, expected_change_type, "
            "authored_before_model_execution) SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS ("
            "SELECT 1 FROM RIPPLE.EVAL.BENCHMARK_LABEL WHERE scenario_id = ? AND asset_id = ?)",
            (
                manifest["scenarioId"],
                asset["assetId"],
                asset["expectedStatus"],
                asset.get("expectedChangeType"),
                authored_before_model,
                manifest["scenarioId"],
                asset["assetId"],
            ),
        )


def _run_deterministic_gate(cursor: SnowflakeCursor) -> dict[str, object]:
    run_id = "run-golden-deterministic-v1"
    cursor.execute(
        "INSERT INTO RIPPLE.PIPELINE.PIPELINE_RUN "
        "(run_id, entity_type, entity_id, status, current_stage, correlation_id) "
        "SELECT ?, 'SOURCE_SNAPSHOT_PAIR', ?, 'QUEUED', 'DETERMINISTIC_DIFF', ? "
        "WHERE NOT EXISTS (SELECT 1 FROM RIPPLE.PIPELINE.PIPELINE_RUN WHERE run_id = ?)",
        (run_id, "snapshot-golden-updated-v1", "correlation-golden-v1", run_id),
    )
    cursor.execute(
        "CALL RIPPLE.CORE.DIFF_SNAPSHOTS(?, ?, ?)",
        (run_id, "snapshot-golden-baseline-v1", "snapshot-golden-updated-v1"),
    )
    row = cursor.fetchone()
    if row is None:
        raise RuntimeError("DIFF_PROCEDURE_NO_RESULT")
    result = row[0]
    if isinstance(result, str):
        result = json.loads(result)
    if not isinstance(result, dict) or not result.get("ok"):
        raise RuntimeError("DETERMINISTIC_GATE_FAILED")
    return cast(dict[str, object], result)


def seed_demo(connection_name: str) -> dict[str, object]:
    """Seed the disclosed fixture through production procedures and return safe counts."""

    fixture_result = verify_fixture_manifest()
    manifest = cast(dict[str, Any], json.loads(MANIFEST_PATH.read_text(encoding="utf-8")))
    snowflake.connector.paramstyle = "qmark"
    connection: SnowflakeConnection = snowflake.connector.connect(connection_name=connection_name)
    try:
        with connection.cursor() as cursor:
            cursor.execute("USE ROLE RIPPLE_ADMIN_ROLE")
            cursor.execute("USE WAREHOUSE RIPPLE_WH")
            _put_file(cursor, MANIFEST_PATH, "@RIPPLE.RAW.FIXTURE_STAGE")
            _seed_source_rows(cursor, manifest, cast(str, fixture_result["manifestSha256"]))
            _seed_asset_rows(cursor, manifest)
            gate_result = _run_deterministic_gate(cursor)
            cursor.execute(
                "SELECT COUNT_IF(status = 'FINALIZED'), COUNT(*) "
                "FROM RIPPLE.CORE.SOURCE_SNAPSHOT WHERE source_id = ?",
                (manifest["sources"][0]["sourceId"],),
            )
            snapshot_counts = cursor.fetchone()
            cursor.execute(
                "SELECT COUNT_IF(validation_status = 'VALID') "
                "FROM RIPPLE.PIPELINE.CHANGE_ATOM WHERE run_id = 'run-golden-deterministic-v1'"
            )
            atom_count_row = cursor.fetchone()
            if snapshot_counts is None or atom_count_row is None:
                raise RuntimeError("GATE_COUNT_QUERY_FAILED")
            return {
                "fixtureManifestSha256": fixture_result["manifestSha256"],
                "gate": gate_result,
                "ok": snapshot_counts == (2, 2) and atom_count_row[0] == 3,
                "snapshotCount": snapshot_counts[1],
                "validatedAtomCount": atom_count_row[0],
            }
    finally:
        connection.close()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--connection", default="RIPPLE_ADMIN_AUTOMATION")
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    print(json.dumps(seed_demo(args.connection), separators=(",", ":"), sort_keys=True))
