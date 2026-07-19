"""Snowpark handler for persisted deterministic section diffs and validated atoms."""

from __future__ import annotations

import json
from hashlib import sha256
from typing import cast

from ripple_deterministic import Section, diff_sections, extract_change_candidates, hash_text
from snowflake.snowpark import Row, Session


def _stable_id(prefix: str, *parts: str) -> str:
    digest = sha256(":".join(parts).encode()).hexdigest()[:32]
    return f"{prefix}-{digest}"


def _load_sections(
    session: Session, snapshot_id: str
) -> tuple[tuple[Section, ...], dict[str, str]]:
    rows: list[Row] = session.sql(
        "SELECT section_id, section_key, ordinal, heading, normalized_text, start_offset, "
        "end_offset, text_sha256 FROM RIPPLE.CORE.SOURCE_SECTION "
        "WHERE snapshot_id = ? ORDER BY ordinal",
        params=[snapshot_id],
    ).collect()
    sections: list[Section] = []
    identifiers: dict[str, str] = {}
    for row in rows:
        key = cast(str, row["SECTION_KEY"])
        identifiers[key] = cast(str, row["SECTION_ID"])
        sections.append(
            Section(
                section_key=key,
                ordinal=cast(int, row["ORDINAL"]),
                heading=cast(str, row["HEADING"]),
                normalized_text=cast(str, row["NORMALIZED_TEXT"]),
                start_offset=cast(int, row["START_OFFSET"]),
                end_offset=cast(int, row["END_OFFSET"]),
                text_sha256=cast(str, row["TEXT_SHA256"]),
            )
        )
    return tuple(sections), identifiers


def _evidence(snapshot_id: str, section_id: str, start: int, end: int, quote: str) -> str:
    return json.dumps(
        {
            "documentVersionId": snapshot_id,
            "sectionId": section_id,
            "startOffset": start,
            "endOffset": end,
            "quoteSha256": hash_text(quote),
        },
        separators=(",", ":"),
        sort_keys=True,
    )


def run(
    session: Session, run_id: str, old_snapshot_id: str, new_snapshot_id: str
) -> dict[str, object]:
    """Persist one bounded deterministic comparison with evidence-validated atoms."""

    snapshot_rows: list[Row] = session.sql(
        "SELECT snapshot_id, source_id, status FROM RIPPLE.CORE.SOURCE_SNAPSHOT "
        "WHERE snapshot_id IN (?, ?)",
        params=[old_snapshot_id, new_snapshot_id],
    ).collect()
    if len(snapshot_rows) != 2:
        return {"code": "SNAPSHOT_PAIR_NOT_FOUND", "ok": False}
    if any(row["STATUS"] != "FINALIZED" for row in snapshot_rows):
        return {"code": "SNAPSHOT_PAIR_NOT_FINALIZED", "ok": False}
    if len({cast(str, row["SOURCE_ID"]) for row in snapshot_rows}) != 1:
        return {"code": "SNAPSHOT_SOURCE_MISMATCH", "ok": False}

    previous_rows: list[Row] = session.sql(
        "SELECT COUNT(*) AS result_count FROM RIPPLE.PIPELINE.SECTION_DIFF WHERE run_id = ?",
        params=[run_id],
    ).collect()
    previous_count = cast(int, previous_rows[0]["RESULT_COUNT"])
    if previous_count:
        return {"ok": True, "reused": True, "section_diff_count": previous_count}

    old_sections, old_ids = _load_sections(session, old_snapshot_id)
    new_sections, new_ids = _load_sections(session, new_snapshot_id)
    diffs = diff_sections(old_sections, new_sections)
    transaction_started = False
    try:
        session.sql("BEGIN TRANSACTION").collect()
        transaction_started = True
        session.sql(
            "UPDATE RIPPLE.PIPELINE.PIPELINE_RUN SET status = 'RUNNING', "
            "current_stage = 'DETERMINISTIC_DIFF', row_version = row_version + 1 "
            "WHERE run_id = ? AND status = 'QUEUED'",
            params=[run_id],
        ).collect()
        run_rows: list[Row] = session.sql(
            "SELECT status FROM RIPPLE.PIPELINE.PIPELINE_RUN WHERE run_id = ?",
            params=[run_id],
        ).collect()
        if len(run_rows) != 1 or run_rows[0]["STATUS"] != "RUNNING":
            raise RuntimeError("RUN_CAS_FAILED")

        atom_count = 0
        for section_diff in diffs:
            old_section = section_diff.old_section
            new_section = section_diff.new_section
            session.sql(
                "INSERT INTO RIPPLE.PIPELINE.SECTION_DIFF "
                "(section_diff_id, run_id, old_snapshot_id, new_snapshot_id, section_key, status, "
                "old_section_id, new_section_id, old_text_sha256, new_text_sha256, created_at) "
                "SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP()",
                params=[
                    _stable_id("diff", run_id, section_diff.section_key),
                    run_id,
                    old_snapshot_id,
                    new_snapshot_id,
                    section_diff.section_key,
                    section_diff.status,
                    old_ids.get(section_diff.section_key),
                    new_ids.get(section_diff.section_key),
                    old_section.text_sha256 if old_section else None,
                    new_section.text_sha256 if new_section else None,
                ],
            ).collect()
            if (
                section_diff.status != "CHANGED"
                or old_section is None
                or new_section is None
                or atom_count >= 3
            ):
                continue
            for candidate in extract_change_candidates(
                old_section.normalized_text, new_section.normalized_text
            ):
                if atom_count >= 3:
                    break
                old_token = candidate.old_token
                new_token = candidate.new_token
                session.sql(
                    "INSERT INTO RIPPLE.PIPELINE.CHANGE_ATOM "
                    "(change_atom_id, run_id, change_type, old_claim, new_claim, old_evidence, "
                    "new_evidence, model_score, validation_status, created_at) "
                    "SELECT ?, ?, ?, ?, ?, PARSE_JSON(?), PARSE_JSON(?), NULL, 'VALID', "
                    "CURRENT_TIMESTAMP()",
                    params=[
                        _stable_id("atom", run_id, candidate.change_type),
                        run_id,
                        candidate.change_type,
                        old_token.raw_text,
                        new_token.raw_text,
                        _evidence(
                            old_snapshot_id,
                            old_ids[section_diff.section_key],
                            old_token.start_offset,
                            old_token.end_offset,
                            old_token.raw_text,
                        ),
                        _evidence(
                            new_snapshot_id,
                            new_ids[section_diff.section_key],
                            new_token.start_offset,
                            new_token.end_offset,
                            new_token.raw_text,
                        ),
                    ],
                ).collect()
                atom_count += 1

        session.sql(
            "UPDATE RIPPLE.PIPELINE.PIPELINE_RUN SET status = 'COMPLETED', "
            "current_stage = 'DETERMINISTIC_DIFF', completed_at = CURRENT_TIMESTAMP(), "
            "row_version = row_version + 1 WHERE run_id = ? AND status = 'RUNNING'",
            params=[run_id],
        ).collect()
        session.sql("COMMIT").collect()
        transaction_started = False
        return {
            "change_atom_count": atom_count,
            "changed_section_count": sum(diff.status == "CHANGED" for diff in diffs),
            "ok": True,
            "reused": False,
            "section_diff_count": len(diffs),
        }
    except Exception:
        if transaction_started:
            session.sql("ROLLBACK").collect()
        session.sql(
            "UPDATE RIPPLE.PIPELINE.PIPELINE_RUN SET status = 'FAILED', "
            "failure_code = 'DETERMINISTIC_DIFF_FAILED', failure_stage = 'DETERMINISTIC_DIFF', "
            "row_version = row_version + 1 WHERE run_id = ? AND status IN ('QUEUED', 'RUNNING')",
            params=[run_id],
        ).collect()
        return {"code": "DETERMINISTIC_DIFF_FAILED", "ok": False}
