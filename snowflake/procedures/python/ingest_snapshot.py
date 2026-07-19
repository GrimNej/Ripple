"""Snowpark handler for hash-verified source snapshot finalization."""

from __future__ import annotations

from hashlib import sha256
from typing import cast

from ripple_deterministic import (
    NORMALIZER_VERSION,
    DeterministicInputError,
    hash_bytes,
    hash_text,
    normalize_source,
    section_text,
)
from snowflake.snowpark import Row, Session
from snowflake.snowpark.files import SnowflakeFile


def _mark_failed(session: Session, snapshot_id: str) -> None:
    session.sql(
        "UPDATE RIPPLE.CORE.SOURCE_SNAPSHOT SET status = 'FAILED' "
        "WHERE snapshot_id = ? AND status = 'RECEIVED'",
        params=[snapshot_id],
    ).collect()


def _section_id(snapshot_id: str, section_key: str) -> str:
    digest = sha256(f"{snapshot_id}:{section_key}".encode()).hexdigest()[:32]
    return f"section-{digest}"


def run(session: Session, snapshot_id: str, scoped_file_url: str) -> dict[str, object]:
    """Verify, normalize, section, and finalize one immutable RECEIVED snapshot."""

    metadata_rows: list[Row] = session.sql(
        "SELECT raw_sha256, byte_size, status FROM RIPPLE.CORE.SOURCE_SNAPSHOT "
        "WHERE snapshot_id = ?",
        params=[snapshot_id],
    ).collect()
    if len(metadata_rows) != 1:
        return {"code": "SNAPSHOT_NOT_FOUND", "ok": False}

    metadata = metadata_rows[0]
    status = cast(str, metadata["STATUS"])
    if status != "RECEIVED":
        return {"code": "SNAPSHOT_NOT_RECEIVED", "ok": False, "status": status}

    transaction_started = False
    try:
        with SnowflakeFile.open(scoped_file_url, "rb", require_scoped_url=True) as source_file:
            raw = cast(bytes, source_file.read())
        expected_size = cast(int, metadata["BYTE_SIZE"])
        expected_hash = cast(str, metadata["RAW_SHA256"])
        if len(raw) != expected_size:
            raise DeterministicInputError("FILE_SIZE_MISMATCH")
        if hash_bytes(raw) != expected_hash:
            raise DeterministicInputError("RAW_HASH_MISMATCH")

        normalized = normalize_source(raw)
        sections = section_text(normalized)
        session.sql("BEGIN TRANSACTION").collect()
        transaction_started = True
        for section in sections:
            session.sql(
                "INSERT INTO RIPPLE.CORE.SOURCE_SECTION "
                "(section_id, snapshot_id, section_key, ordinal, heading, normalized_text, "
                "start_offset, end_offset, text_sha256, normalizer_version, created_at) "
                "SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP()",
                params=[
                    _section_id(snapshot_id, section.section_key),
                    snapshot_id,
                    section.section_key,
                    section.ordinal,
                    section.heading,
                    section.normalized_text,
                    section.start_offset,
                    section.end_offset,
                    section.text_sha256,
                    NORMALIZER_VERSION,
                ],
            ).collect()

        session.sql(
            "UPDATE RIPPLE.CORE.SOURCE_SNAPSHOT SET normalized_sha256 = ?, "
            "normalizer_version = ?, status = 'FINALIZED' "
            "WHERE snapshot_id = ? AND status = 'RECEIVED'",
            params=[hash_text(normalized), NORMALIZER_VERSION, snapshot_id],
        ).collect()
        finalized_rows: list[Row] = session.sql(
            "SELECT status FROM RIPPLE.CORE.SOURCE_SNAPSHOT WHERE snapshot_id = ?",
            params=[snapshot_id],
        ).collect()
        if len(finalized_rows) != 1 or finalized_rows[0]["STATUS"] != "FINALIZED":
            raise DeterministicInputError("FINALIZE_CAS_FAILED")
        session.sql("COMMIT").collect()
        transaction_started = False
        return {
            "normalized_sha256": hash_text(normalized),
            "normalizer_version": NORMALIZER_VERSION,
            "ok": True,
            "section_count": len(sections),
            "status": "FINALIZED",
        }
    except DeterministicInputError as error:
        if transaction_started:
            session.sql("ROLLBACK").collect()
        _mark_failed(session, snapshot_id)
        return {"code": error.code, "ok": False, "status": "FAILED"}
    except Exception:
        if transaction_started:
            session.sql("ROLLBACK").collect()
        _mark_failed(session, snapshot_id)
        return {"code": "SNAPSHOT_FINALIZE_FAILED", "ok": False, "status": "FAILED"}
