"""Snowpark handlers for bounded public GitHub source monitors."""

from __future__ import annotations

import json
import re
from hashlib import sha256
from typing import TypedDict, cast

from ripple_deterministic import NORMALIZER_VERSION, hash_text, normalize_source, section_text
from run_pipeline import start_analysis
from snowflake.snowpark import Row, Session

MAX_ASSETS = 8
MAX_SOURCE_BYTES = 1_048_576
MAX_ASSET_BYTES = 262_144
MAX_TOTAL_BYTES = 2_097_152
_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
_SAFE_REPOSITORY_PART = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")
_SAFE_COMMIT = re.compile(r"^[0-9a-f]{40}$")
_SAFE_PATH = re.compile(r"^(?!/)(?!.*(?:^|/)\.\.(?:/|$))[A-Za-z0-9_./ -]{1,240}$")
_ASSET_TYPES = {"README", "INSTALL_GUIDE", "SUPPORT_MACRO", "TROUBLESHOOTING", "WORKFLOW"}
_CRITICALITIES = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
_INTERVALS = {720, 1440}


class MonitorInputError(ValueError):
    """Content-free monitor validation error."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


class AssetPayload(TypedDict):
    path: str
    title: str
    assetType: str
    criticality: str
    content: str
    contentSha256: str


class MonitorPayload(TypedDict):
    monitorId: str
    name: str
    repositoryOwner: str
    repositoryName: str
    branch: str
    sourcePath: str
    sourceContent: str
    sourceSha256: str
    commitSha: str
    commitUrl: str
    committedAt: str
    notificationEmail: str
    checkIntervalMinutes: int
    assets: list[AssetPayload]


def _stable_id(prefix: str, *parts: str) -> str:
    digest = sha256(":".join(parts).encode()).hexdigest()[:32]
    return f"{prefix}-{digest}"


def _analysis_key(monitor_id: str, old_snapshot_id: str, new_snapshot_id: str) -> str:
    return sha256(f"{monitor_id}:{old_snapshot_id}:{new_snapshot_id}".encode()).hexdigest()


def _affected_one(rows: list[Row]) -> bool:
    """Read Snowflake's single-row DML result without depending on its column label."""

    return bool(rows and rows[0][0] == 1)


def _json(value: object) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True)


def _require_string(value: object, code: str, maximum: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise MonitorInputError(code)
    return value.strip()


def _require_content(value: object, code: str, maximum: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise MonitorInputError(code)
    return value


def _require_hash(content: str, claimed_hash: object, code: str, maximum: int) -> str:
    encoded = content.encode("utf-8", errors="strict")
    if len(encoded) > maximum:
        raise MonitorInputError(code)
    actual = sha256(encoded).hexdigest()
    if claimed_hash != actual:
        raise MonitorInputError("CONTENT_HASH_MISMATCH")
    return actual


def validate_payload(raw_payload: str, require_assets: bool) -> MonitorPayload:
    """Validate the Worker-produced payload before any Snowflake mutation."""

    try:
        parsed: object = json.loads(raw_payload)
    except (TypeError, json.JSONDecodeError) as error:
        raise MonitorInputError("INVALID_MONITOR_PAYLOAD") from error
    if not isinstance(parsed, dict):
        raise MonitorInputError("INVALID_MONITOR_PAYLOAD")
    payload = cast(dict[str, object], parsed)
    monitor_id = _require_string(payload.get("monitorId"), "INVALID_MONITOR_ID", 128)
    owner = _require_string(payload.get("repositoryOwner"), "INVALID_REPOSITORY", 100)
    repository = _require_string(payload.get("repositoryName"), "INVALID_REPOSITORY", 100)
    branch = _require_string(payload.get("branch"), "INVALID_BRANCH", 100)
    source_path = _require_string(payload.get("sourcePath"), "INVALID_SOURCE_PATH", 240)
    commit_sha = _require_string(payload.get("commitSha"), "INVALID_COMMIT", 40).lower()
    if _SAFE_ID.fullmatch(monitor_id) is None:
        raise MonitorInputError("INVALID_MONITOR_ID")
    if (
        _SAFE_REPOSITORY_PART.fullmatch(owner) is None
        or _SAFE_REPOSITORY_PART.fullmatch(repository) is None
    ):
        raise MonitorInputError("INVALID_REPOSITORY")
    if _SAFE_REPOSITORY_PART.fullmatch(branch) is None or _SAFE_PATH.fullmatch(source_path) is None:
        raise MonitorInputError("INVALID_SOURCE_LOCATION")
    if _SAFE_COMMIT.fullmatch(commit_sha) is None:
        raise MonitorInputError("INVALID_COMMIT")
    source_content = _require_content(
        payload.get("sourceContent"), "INVALID_SOURCE_CONTENT", MAX_SOURCE_BYTES
    )
    source_hash = _require_hash(
        source_content, payload.get("sourceSha256"), "SOURCE_TOO_LARGE", MAX_SOURCE_BYTES
    )
    interval = payload.get("checkIntervalMinutes")
    if not isinstance(interval, int) or interval not in _INTERVALS:
        raise MonitorInputError("INVALID_CHECK_INTERVAL")
    assets_raw = payload.get("assets")
    if not isinstance(assets_raw, list) or len(assets_raw) > MAX_ASSETS:
        raise MonitorInputError("INVALID_ASSETS")
    if require_assets and not assets_raw:
        raise MonitorInputError("ASSETS_REQUIRED")
    assets: list[AssetPayload] = []
    total_bytes = len(source_content.encode("utf-8"))
    for asset_raw in assets_raw:
        if not isinstance(asset_raw, dict):
            raise MonitorInputError("INVALID_ASSET")
        asset = cast(dict[str, object], asset_raw)
        path = _require_string(asset.get("path"), "INVALID_ASSET_PATH", 240)
        title = _require_string(asset.get("title"), "INVALID_ASSET_TITLE", 160)
        asset_type = _require_string(asset.get("assetType"), "INVALID_ASSET_TYPE", 32)
        criticality = _require_string(asset.get("criticality"), "INVALID_CRITICALITY", 16)
        content = _require_content(asset.get("content"), "INVALID_ASSET_CONTENT", MAX_ASSET_BYTES)
        if _SAFE_PATH.fullmatch(path) is None or asset_type not in _ASSET_TYPES:
            raise MonitorInputError("INVALID_ASSET")
        if criticality not in _CRITICALITIES:
            raise MonitorInputError("INVALID_ASSET")
        content_hash = _require_hash(
            content, asset.get("contentSha256"), "ASSET_TOO_LARGE", MAX_ASSET_BYTES
        )
        total_bytes += len(content.encode("utf-8"))
        assets.append(
            {
                "path": path,
                "title": title,
                "assetType": asset_type,
                "criticality": criticality,
                "content": content,
                "contentSha256": content_hash,
            }
        )
    if total_bytes > MAX_TOTAL_BYTES:
        raise MonitorInputError("CHANGE_SET_TOO_LARGE")
    notification_email = str(payload.get("notificationEmail") or "").strip().lower()
    if notification_email and (len(notification_email) > 254 or "@" not in notification_email):
        raise MonitorInputError("INVALID_NOTIFICATION_EMAIL")
    return {
        "monitorId": monitor_id,
        "name": _require_string(payload.get("name"), "INVALID_MONITOR_NAME", 100),
        "repositoryOwner": owner,
        "repositoryName": repository,
        "branch": branch,
        "sourcePath": source_path,
        "sourceContent": source_content,
        "sourceSha256": source_hash,
        "commitSha": commit_sha,
        "commitUrl": _require_string(payload.get("commitUrl"), "INVALID_COMMIT_URL", 500),
        "committedAt": _require_string(payload.get("committedAt"), "INVALID_COMMIT_TIME", 64),
        "notificationEmail": notification_email,
        "checkIntervalMinutes": interval,
        "assets": assets,
    }


def _insert_snapshot(session: Session, payload: MonitorPayload, source_id: str) -> str:
    snapshot_id = _stable_id("snapshot", source_id, payload["commitSha"])
    normalized = normalize_source(payload["sourceContent"].encode("utf-8"))
    sections = section_text(normalized)
    session.sql(
        "INSERT INTO RIPPLE.RAW.LIVE_SOURCE_CONTENT "
        "(snapshot_id, raw_content, raw_sha256) SELECT ?, ?, ? WHERE NOT EXISTS ("
        "SELECT 1 FROM RIPPLE.RAW.LIVE_SOURCE_CONTENT WHERE snapshot_id = ?)",
        params=[snapshot_id, payload["sourceContent"], payload["sourceSha256"], snapshot_id],
    ).collect()
    session.sql(
        "INSERT INTO RIPPLE.CORE.SOURCE_SNAPSHOT (snapshot_id, source_id, version_label, "
        "artifact_stage_path, raw_sha256, normalized_sha256, content_type, byte_size, "
        "normalizer_version, retrieved_at, fixture_disclosure, licence_basis, status) "
        "SELECT ?, ?, ?, ?, ?, ?, 'text/markdown; charset=utf-8', ?, ?, TO_TIMESTAMP_TZ(?), "
        "'Live public GitHub snapshot', 'Operator-connected public repository', 'FINALIZED' "
        "WHERE NOT EXISTS (SELECT 1 FROM RIPPLE.CORE.SOURCE_SNAPSHOT WHERE snapshot_id = ?)",
        params=[
            snapshot_id,
            source_id,
            payload["commitSha"][:12],
            payload["commitUrl"],
            payload["sourceSha256"],
            hash_text(normalized),
            len(payload["sourceContent"].encode("utf-8")),
            NORMALIZER_VERSION,
            payload["committedAt"],
            snapshot_id,
        ],
    ).collect()
    for section in sections:
        section_id = _stable_id("section", snapshot_id, section.section_key)
        session.sql(
            "INSERT INTO RIPPLE.CORE.SOURCE_SECTION (section_id, snapshot_id, section_key, "
            "ordinal, heading, normalized_text, start_offset, end_offset, text_sha256, "
            "normalizer_version) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS ("
            "SELECT 1 FROM RIPPLE.CORE.SOURCE_SECTION WHERE section_id = ?)",
            params=[
                section_id,
                snapshot_id,
                section.section_key,
                section.ordinal,
                section.heading,
                section.normalized_text,
                section.start_offset,
                section.end_offset,
                section.text_sha256,
                NORMALIZER_VERSION,
                section_id,
            ],
        ).collect()
    return snapshot_id


def _insert_assets(session: Session, payload: MonitorPayload) -> None:
    for asset in payload["assets"]:
        asset_id = _stable_id(
            "asset",
            payload["monitorId"],
            payload["repositoryOwner"],
            payload["repositoryName"],
            asset["path"],
        )
        version_id = _stable_id("asset-version", asset_id, payload["commitSha"])
        session.sql(
            "INSERT INTO RIPPLE.CORE.KNOWLEDGE_ASSET (asset_id, stable_key, asset_type, "
            "title, criticality, current_version_id) SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS ("
            "SELECT 1 FROM RIPPLE.CORE.KNOWLEDGE_ASSET WHERE asset_id = ?)",
            params=[
                asset_id,
                f"{payload['monitorId']}:{payload['repositoryOwner']}/"
                f"{payload['repositoryName']}:{asset['path']}",
                asset["assetType"],
                asset["title"],
                asset["criticality"],
                version_id,
                asset_id,
            ],
        ).collect()
        metadata = {
            "commitSha": payload["commitSha"],
            "path": asset["path"],
            "provider": "GITHUB",
            "repository": f"{payload['repositoryOwner']}/{payload['repositoryName']}",
        }
        session.sql(
            "INSERT INTO RIPPLE.CORE.ASSET_VERSION (asset_version_id, asset_id, version_label, "
            "content, content_sha256, metadata_variant, created_by) SELECT ?, ?, ?, ?, ?, "
            "PARSE_JSON(?), 'github-monitor' WHERE NOT EXISTS (SELECT 1 FROM "
            "RIPPLE.CORE.ASSET_VERSION WHERE asset_version_id = ?)",
            params=[
                version_id,
                asset_id,
                payload["commitSha"][:12],
                asset["content"],
                asset["contentSha256"],
                _json(metadata),
                version_id,
            ],
        ).collect()


def ingest(
    session: Session,
    payload_json: str,
    trigger_type: str,
    idempotency_key: str,
    correlation_id: str,
) -> dict[str, object]:
    """Create a monitor baseline or capture its next immutable GitHub snapshot."""

    trigger = trigger_type.upper()
    if trigger not in {"CONNECT", "MANUAL", "SCHEDULED"}:
        return {"code": "INVALID_TRIGGER_TYPE", "ok": False}
    try:
        payload = validate_payload(payload_json, require_assets=trigger == "CONNECT")
    except MonitorInputError as error:
        return {"code": error.code, "ok": False}
    source_id = _stable_id(
        "source",
        payload["repositoryOwner"],
        payload["repositoryName"],
        payload["sourcePath"],
    )
    check_id = _stable_id("check", payload["monitorId"], payload["commitSha"], idempotency_key)
    monitor_rows: list[Row] = session.sql(
        "SELECT last_commit_sha, last_snapshot_id FROM RIPPLE.APP.SOURCE_MONITOR "
        "WHERE monitor_id = ?",
        params=[payload["monitorId"]],
    ).collect()
    if trigger == "CONNECT" and monitor_rows:
        return {"code": "MONITOR_ALREADY_EXISTS", "ok": False}
    if trigger != "CONNECT" and not monitor_rows:
        return {"code": "MONITOR_NOT_FOUND", "ok": False}
    old_commit = cast(str | None, monitor_rows[0]["LAST_COMMIT_SHA"]) if monitor_rows else None
    old_snapshot_id = (
        cast(str | None, monitor_rows[0]["LAST_SNAPSHOT_ID"]) if monitor_rows else None
    )
    if old_commit == payload["commitSha"]:
        unresolved_rows: list[Row] = session.sql(
            "SELECT check_id, snapshot_id, previous_snapshot_id FROM "
            "RIPPLE.OPS.MONITOR_CHECK WHERE monitor_id = ? AND commit_sha = ? "
            "AND status = 'CHANGE_DETECTED' AND run_id IS NULL AND snapshot_id IS NOT NULL "
            "AND previous_snapshot_id IS NOT NULL ORDER BY checked_at DESC LIMIT 1",
            params=[payload["monitorId"], old_commit],
        ).collect()
        if unresolved_rows:
            unresolved = unresolved_rows[0]
            pending_snapshot_id = cast(str, unresolved["SNAPSHOT_ID"])
            previous_snapshot_id = cast(str, unresolved["PREVIOUS_SNAPSHOT_ID"])
            analysis = start_analysis(
                session,
                previous_snapshot_id,
                pending_snapshot_id,
                _analysis_key(payload["monitorId"], previous_snapshot_id, pending_snapshot_id),
                correlation_id,
            )
            if not analysis.get("ok"):
                return analysis
            run_id = cast(str, analysis["runId"])
            session.sql(
                "UPDATE RIPPLE.OPS.MONITOR_CHECK SET run_id = ? WHERE check_id = ? "
                "AND run_id IS NULL",
                params=[run_id, unresolved["CHECK_ID"]],
            ).collect()
            session.sql(
                "UPDATE RIPPLE.APP.SOURCE_MONITOR SET status = 'CHANGE_DETECTED', "
                "last_error_code = NULL, updated_at = CURRENT_TIMESTAMP() WHERE monitor_id = ?",
                params=[payload["monitorId"]],
            ).collect()
            return {
                "checkId": unresolved["CHECK_ID"],
                "ok": True,
                "runId": run_id,
                "status": "CHANGE_DETECTED",
            }
        session.sql(
            "UPDATE RIPPLE.APP.SOURCE_MONITOR SET last_checked_at = CURRENT_TIMESTAMP(), "
            "status = 'HEALTHY', last_error_code = NULL, row_version = row_version + 1, "
            "updated_at = CURRENT_TIMESTAMP() "
            "WHERE monitor_id = ? AND last_commit_sha = ?",
            params=[payload["monitorId"], old_commit],
        ).collect()
        session.sql(
            "INSERT INTO RIPPLE.OPS.MONITOR_CHECK (check_id, monitor_id, trigger_type, status, "
            "commit_sha, previous_commit_sha, notification_status) SELECT ?, ?, ?, 'NO_CHANGE', "
            "?, ?, 'NOT_REQUIRED' WHERE NOT EXISTS (SELECT 1 FROM RIPPLE.OPS.MONITOR_CHECK "
            "WHERE check_id = ?)",
            params=[
                check_id,
                payload["monitorId"],
                trigger,
                payload["commitSha"],
                old_commit,
                check_id,
            ],
        ).collect()
        return {"checkId": check_id, "ok": True, "status": "NO_CHANGE"}
    session.sql("BEGIN TRANSACTION").collect()
    try:
        session.sql(
            "INSERT INTO RIPPLE.CORE.SOURCE (source_id, name, canonical_url, source_kind, active) "
            "SELECT ?, ?, ?, 'AUTHORITATIVE_DOC', TRUE WHERE NOT EXISTS (SELECT 1 FROM "
            "RIPPLE.CORE.SOURCE WHERE source_id = ?)",
            params=[source_id, payload["name"], payload["commitUrl"], source_id],
        ).collect()
        snapshot_id = _insert_snapshot(session, payload, source_id)
        if trigger == "CONNECT":
            _insert_assets(session, payload)
            asset_manifest = [
                {
                    "assetType": asset["assetType"],
                    "criticality": asset["criticality"],
                    "path": asset["path"],
                    "title": asset["title"],
                }
                for asset in payload["assets"]
            ]
            session.sql(
                "INSERT INTO RIPPLE.APP.SOURCE_MONITOR (monitor_id, name, provider, "
                "repository_owner, repository_name, branch_name, source_path, asset_manifest, "
                "notification_email, check_interval_minutes, enabled, status, last_checked_at, "
                "last_commit_sha, last_snapshot_id) SELECT ?, ?, 'GITHUB', ?, ?, ?, ?, "
                "PARSE_JSON(?), NULLIF(?, ''), ?, TRUE, 'HEALTHY', CURRENT_TIMESTAMP(), ?, ?",
                params=[
                    payload["monitorId"],
                    payload["name"],
                    payload["repositoryOwner"],
                    payload["repositoryName"],
                    payload["branch"],
                    payload["sourcePath"],
                    _json(asset_manifest),
                    payload["notificationEmail"],
                    payload["checkIntervalMinutes"],
                    payload["commitSha"],
                    snapshot_id,
                ],
            ).collect()
            status = "BASELINE_CAPTURED"
        else:
            updated_rows: list[Row] = session.sql(
                "UPDATE RIPPLE.APP.SOURCE_MONITOR SET last_checked_at = CURRENT_TIMESTAMP(), "
                "last_commit_sha = ?, last_snapshot_id = ?, status = 'CHANGE_DETECTED', "
                "last_error_code = NULL, row_version = row_version + 1, "
                "updated_at = CURRENT_TIMESTAMP() WHERE monitor_id = ? "
                "AND last_commit_sha = ?",
                params=[payload["commitSha"], snapshot_id, payload["monitorId"], old_commit],
            ).collect()
            if not _affected_one(updated_rows):
                session.sql("ROLLBACK").collect()
                return {"code": "STALE_MONITOR", "ok": False}
            status = "CHANGE_DETECTED"
        session.sql(
            "INSERT INTO RIPPLE.OPS.MONITOR_CHECK (check_id, monitor_id, trigger_type, status, "
            "commit_sha, previous_commit_sha, snapshot_id, previous_snapshot_id, "
            "notification_status) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS "
            "(SELECT 1 FROM RIPPLE.OPS.MONITOR_CHECK WHERE "
            "check_id = ?)",
            params=[
                check_id,
                payload["monitorId"],
                trigger,
                status,
                payload["commitSha"],
                old_commit,
                snapshot_id,
                old_snapshot_id,
                "PENDING" if status == "CHANGE_DETECTED" else "NOT_REQUIRED",
                check_id,
            ],
        ).collect()
        session.sql("COMMIT").collect()
    except Exception:
        session.sql("ROLLBACK").collect()
        return {"code": "MONITOR_INGEST_FAILED", "ok": False}
    response: dict[str, object] = {
        "checkId": check_id,
        "commitSha": payload["commitSha"],
        "monitorId": payload["monitorId"],
        "ok": True,
        "snapshotId": snapshot_id,
        "status": status,
    }
    if status == "CHANGE_DETECTED" and old_snapshot_id:
        analysis = start_analysis(
            session,
            old_snapshot_id,
            snapshot_id,
            _analysis_key(payload["monitorId"], old_snapshot_id, snapshot_id),
            correlation_id,
        )
        if not analysis.get("ok"):
            session.sql(
                "UPDATE RIPPLE.APP.SOURCE_MONITOR SET status = 'ERROR', "
                "last_error_code = 'ANALYSIS_QUEUE_FAILED', updated_at = CURRENT_TIMESTAMP() "
                "WHERE monitor_id = ? AND last_commit_sha = ?",
                params=[payload["monitorId"], payload["commitSha"]],
            ).collect()
            return analysis
        run_id = cast(str, analysis["runId"])
        session.sql(
            "UPDATE RIPPLE.OPS.MONITOR_CHECK SET run_id = ? WHERE check_id = ? AND run_id IS NULL",
            params=[run_id, check_id],
        ).collect()
        response["runId"] = run_id
    return response
