"""Snowpark handler for deterministic post-application patch verification."""

from __future__ import annotations

import json
import re
from hashlib import sha256
from typing import Any, cast

from audit_chain import append_audit, canonical_json
from patch_logic import VerificationInput, verify_patch
from pipeline_logic import EvidenceSpan
from ripple_deterministic import ChangeType, hash_text
from snowflake.snowpark import Row, Session

_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
_IDEMPOTENCY_KEY = re.compile(r"^[A-Za-z0-9_-]{20,128}$")
ALGORITHM_VERSION = "ripple-deterministic-verifier-v1"


def _variant(value: object) -> dict[str, Any]:
    parsed = json.loads(value) if isinstance(value, str) else value
    if not isinstance(parsed, dict):
        raise ValueError("INVALID_VARIANT")
    return cast(dict[str, Any], parsed)


def _stable_id(prefix: str, *parts: str) -> str:
    return f"{prefix}-{sha256(':'.join(parts).encode()).hexdigest()[:32]}"


def _failure(code: str) -> dict[str, object]:
    return {"code": code, "ok": False}


def run(
    session: Session,
    patch_id: str,
    expected_patch_row_version: int,
    idempotency_key: str,
    correlation_id: str,
) -> dict[str, object]:
    """Verify one applied immutable asset version and persist the deterministic result."""

    if _SAFE_ID.fullmatch(patch_id) is None or _SAFE_ID.fullmatch(correlation_id) is None:
        return _failure("INVALID_IDENTIFIER")
    if _IDEMPOTENCY_KEY.fullmatch(idempotency_key) is None:
        return _failure("INVALID_IDEMPOTENCY_KEY")
    if expected_patch_row_version < 0:
        return _failure("INVALID_PATCH_ROW_VERSION")
    request_hash = hash_text(
        canonical_json(
            {
                "expectedPatchRowVersion": expected_patch_row_version,
                "patchId": patch_id,
            }
        )
    )
    replay_rows: list[Row] = session.sql(
        "SELECT request_sha256, response_body FROM RIPPLE.APP.MUTATION_REPLAY "
        "WHERE mutation_type = 'VERIFY_PATCH' AND entity_id = ? AND idempotency_key = ? "
        "AND expires_at > CURRENT_TIMESTAMP() ORDER BY created_at DESC LIMIT 1",
        params=[patch_id, idempotency_key],
    ).collect()
    if replay_rows:
        if replay_rows[0]["REQUEST_SHA256"] != request_hash:
            return _failure("IDEMPOTENCY_CONFLICT")
        return _variant(replay_rows[0]["RESPONSE_BODY"])

    rows: list[Row] = session.sql(
        "SELECT p.status, p.row_version, p.applied_asset_version_id, p.asset_id, "
        "original.content AS original_content, applied.content AS approved_content, "
        "a.change_type, a.old_claim, a.new_claim, f.asset_evidence, "
        "label.expected_status, label.authored_before_model_execution "
        "FROM RIPPLE.APP.PATCH_PROPOSAL AS p "
        "JOIN RIPPLE.PIPELINE.IMPACT_FINDING AS f ON f.finding_id = p.finding_id "
        "JOIN RIPPLE.PIPELINE.CHANGE_ATOM AS a ON a.change_atom_id = f.change_atom_id "
        "JOIN RIPPLE.CORE.ASSET_VERSION AS original "
        "ON original.asset_version_id = p.target_asset_version_id "
        "LEFT JOIN RIPPLE.CORE.ASSET_VERSION AS applied "
        "ON applied.asset_version_id = p.applied_asset_version_id "
        "LEFT JOIN RIPPLE.EVAL.BENCHMARK_LABEL AS label ON label.asset_id = p.asset_id "
        "WHERE p.patch_id = ? LIMIT 2",
        params=[patch_id],
    ).collect()
    if len(rows) != 1:
        return _failure("PATCH_NOT_FOUND")
    row = rows[0]
    if row["STATUS"] != "APPLIED":
        return _failure(
            "PATCH_ALREADY_VERIFIED"
            if row["STATUS"] in {"VERIFIED", "VERIFICATION_FAILED", "HUMAN_VERIFICATION_REQUIRED"}
            else "PATCH_NOT_APPLIED"
        )
    if int(row["ROW_VERSION"]) != expected_patch_row_version:
        return _failure("STALE_PATCH_REVISION")
    if row["APPLIED_ASSET_VERSION_ID"] is None or row["APPROVED_CONTENT"] is None:
        return _failure("APPLIED_VERSION_MISSING")
    try:
        evidence_value = _variant(row["ASSET_EVIDENCE"])
        evidence = EvidenceSpan(
            int(evidence_value["startOffset"]),
            int(evidence_value["endOffset"]),
            cast(str, evidence_value["quoteSha256"]),
        )
        outcome = verify_patch(
            VerificationInput(
                cast(ChangeType, row["CHANGE_TYPE"]),
                cast(str, row["OLD_CLAIM"]),
                cast(str, row["NEW_CLAIM"]),
                cast(str, row["ORIGINAL_CONTENT"]),
                cast(str, row["APPROVED_CONTENT"]),
                evidence,
                cast(str | None, row["EXPECTED_STATUS"]),
                cast(bool | None, row["AUTHORED_BEFORE_MODEL_EXECUTION"]),
            )
        )
    except (KeyError, TypeError, ValueError):
        return _failure("VERIFICATION_INPUT_INVALID")

    patch_status = {
        "VERIFIED": "VERIFIED",
        "FAILED": "VERIFICATION_FAILED",
        "HUMAN_REQUIRED": "HUMAN_VERIFICATION_REQUIRED",
    }[outcome.status]
    checks = {
        "algorithmVersion": ALGORITHM_VERSION,
        "approvedUnrelatedSha256": outcome.approved_unrelated_sha256,
        "checks": {name: passed for name, passed in outcome.checks},
        "originalUnrelatedSha256": outcome.original_unrelated_sha256,
    }
    response: dict[str, object] = {
        "assetVersionId": row["APPLIED_ASSET_VERSION_ID"],
        "code": "PATCH_VERIFIED" if outcome.status == "VERIFIED" else patch_status,
        "ok": True,
        "patchId": patch_id,
        "status": patch_status,
    }
    transaction_started = False
    try:
        session.sql("BEGIN TRANSACTION").collect()
        transaction_started = True
        updated = session.sql(
            "UPDATE RIPPLE.APP.PATCH_PROPOSAL SET status = ?, row_version = row_version + 1, "
            "updated_at = CURRENT_TIMESTAMP() WHERE patch_id = ? AND status = 'APPLIED' "
            "AND row_version = ? AND applied_asset_version_id = ?",
            params=[
                patch_status,
                patch_id,
                expected_patch_row_version,
                row["APPLIED_ASSET_VERSION_ID"],
            ],
        ).collect()
        if not updated or int(updated[0][0]) != 1:
            session.sql("ROLLBACK").collect()
            transaction_started = False
            return _failure("STALE_PATCH_REVISION")
        verification_id = _stable_id(
            "verification",
            patch_id,
            cast(str, row["APPLIED_ASSET_VERSION_ID"]),
            ALGORITHM_VERSION,
        )
        session.sql(
            "INSERT INTO RIPPLE.APP.VERIFICATION_RESULT "
            "(verification_id, patch_id, asset_version_id, change_type, status, checks, "
            "ai_advisory) SELECT ?, ?, ?, ?, ?, PARSE_JSON(?), PARSE_JSON(?)",
            params=[
                verification_id,
                patch_id,
                row["APPLIED_ASSET_VERSION_ID"],
                row["CHANGE_TYPE"],
                outcome.status,
                canonical_json(checks),
                canonical_json({"controlsFinalStatus": False, "status": "NOT_RUN"}),
            ],
        ).collect()
        append_audit(
            session,
            entity_type="PATCH_PROPOSAL",
            entity_id=patch_id,
            event_type=f"PATCH_{patch_status}",
            actor="operator",
            correlation_id=correlation_id,
            payload={
                "algorithmVersion": ALGORITHM_VERSION,
                "assetVersionId": row["APPLIED_ASSET_VERSION_ID"],
                "verificationId": verification_id,
            },
        )
        session.sql(
            "INSERT INTO RIPPLE.APP.MUTATION_REPLAY "
            "(mutation_type, entity_id, idempotency_key, request_sha256, response_status, "
            "response_body, expires_at) SELECT 'VERIFY_PATCH', ?, ?, ?, 200, "
            "PARSE_JSON(?), DATEADD('hour', 24, CURRENT_TIMESTAMP())",
            params=[patch_id, idempotency_key, request_hash, canonical_json(response)],
        ).collect()
        session.sql("COMMIT").collect()
        transaction_started = False
        return response
    except Exception:
        if transaction_started:
            session.sql("ROLLBACK").collect()
        return _failure("VERIFY_PATCH_FAILED")
