"""Transactional compare-and-set audit-chain appends for Snowpark procedures."""

from __future__ import annotations

import json
from hashlib import sha256

from ripple_deterministic import hash_text
from snowflake.snowpark import Row, Session


class AuditAppendError(RuntimeError):
    """Content-free audit failure with a stable code."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def canonical_json(value: object) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True)


def calculate_event_hash(
    *,
    event_sequence: int,
    entity_type: str,
    entity_id: str,
    event_type: str,
    actor: str,
    correlation_id: str,
    payload_hash: str,
    previous_event_hash: str | None,
) -> str:
    """Return the frozen audit-chain hash for one event."""

    return hash_text(
        ":".join(
            [
                str(event_sequence),
                entity_type,
                entity_id,
                event_type,
                actor,
                correlation_id,
                payload_hash,
                previous_event_hash or "GENESIS",
            ]
        )
    )


def append_audit(
    session: Session,
    *,
    entity_type: str,
    entity_id: str,
    event_type: str,
    actor: str,
    correlation_id: str,
    payload: object,
) -> None:
    """Append one event after atomically advancing the singleton audit head."""

    payload_hash = hash_text(canonical_json(payload))
    head_exists: list[Row] = session.sql(
        "SELECT COUNT(*) AS table_count FROM RIPPLE.INFORMATION_SCHEMA.TABLES "
        "WHERE table_schema = 'OPS' AND table_name = 'AUDIT_HEAD'"
    ).collect()
    if int(head_exists[0]["TABLE_COUNT"]) == 0:
        _append_without_head(
            session,
            entity_type=entity_type,
            entity_id=entity_id,
            event_type=event_type,
            actor=actor,
            correlation_id=correlation_id,
            payload_hash=payload_hash,
        )
        return
    for _ in range(5):
        rows: list[Row] = session.sql(
            "SELECT event_sequence, event_hash, row_version FROM RIPPLE.OPS.AUDIT_HEAD "
            "WHERE head_name = 'GLOBAL'"
        ).collect()
        if len(rows) != 1:
            raise AuditAppendError("AUDIT_HEAD_INVALID")
        previous_sequence = int(rows[0]["EVENT_SEQUENCE"])
        previous_hash_value = rows[0]["EVENT_HASH"]
        previous_hash = str(previous_hash_value) if previous_hash_value is not None else None
        row_version = int(rows[0]["ROW_VERSION"])
        sequence = previous_sequence + 1
        event_hash = calculate_event_hash(
            event_sequence=sequence,
            entity_type=entity_type,
            entity_id=entity_id,
            event_type=event_type,
            actor=actor,
            correlation_id=correlation_id,
            payload_hash=payload_hash,
            previous_event_hash=previous_hash,
        )
        updated = session.sql(
            "UPDATE RIPPLE.OPS.AUDIT_HEAD SET event_sequence = ?, event_hash = ?, "
            "row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP() "
            "WHERE head_name = 'GLOBAL' AND event_sequence = ? AND row_version = ?",
            params=[sequence, event_hash, previous_sequence, row_version],
        ).collect()
        if not updated or int(updated[0][0]) != 1:
            continue
        event_id = f"audit-{sha256(f'{sequence}:{event_hash}'.encode()).hexdigest()[:32]}"
        session.sql(
            "INSERT INTO RIPPLE.OPS.AUDIT_EVENT "
            "(event_id, event_sequence, entity_type, entity_id, event_type, actor, "
            "correlation_id, payload_hash, previous_event_hash, event_hash) "
            "SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?",
            params=[
                event_id,
                sequence,
                entity_type,
                entity_id,
                event_type,
                actor,
                correlation_id,
                payload_hash,
                previous_hash,
                event_hash,
            ],
        ).collect()
        return
    raise AuditAppendError("AUDIT_APPEND_CONFLICT")


def _append_without_head(
    session: Session,
    *,
    entity_type: str,
    entity_id: str,
    event_type: str,
    actor: str,
    correlation_id: str,
    payload_hash: str,
) -> None:
    """Preserve Phase 3 behavior after a deliberate Phase 4 state rollback."""

    previous_rows: list[Row] = session.sql(
        "SELECT event_sequence, event_hash FROM RIPPLE.OPS.AUDIT_EVENT "
        "ORDER BY event_sequence DESC LIMIT 1"
    ).collect()
    sequence = int(previous_rows[0]["EVENT_SEQUENCE"]) + 1 if previous_rows else 1
    previous_hash = str(previous_rows[0]["EVENT_HASH"]) if previous_rows else None
    event_hash = calculate_event_hash(
        event_sequence=sequence,
        entity_type=entity_type,
        entity_id=entity_id,
        event_type=event_type,
        actor=actor,
        correlation_id=correlation_id,
        payload_hash=payload_hash,
        previous_event_hash=previous_hash,
    )
    event_id = f"audit-{sha256(f'{sequence}:{event_hash}'.encode()).hexdigest()[:32]}"
    session.sql(
        "INSERT INTO RIPPLE.OPS.AUDIT_EVENT "
        "(event_id, event_sequence, entity_type, entity_id, event_type, actor, "
        "correlation_id, payload_hash, previous_event_hash, event_hash) "
        "SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?",
        params=[
            event_id,
            sequence,
            entity_type,
            entity_id,
            event_type,
            actor,
            correlation_id,
            payload_hash,
            previous_hash,
            event_hash,
        ],
    ).collect()
