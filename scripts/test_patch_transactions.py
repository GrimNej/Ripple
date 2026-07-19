"""Run the live Phase 4 revision, rejection, concurrency, replay, and verification gate."""

from __future__ import annotations

import argparse
import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from hashlib import sha256
from typing import Any, cast

import snowflake.connector
from snowflake.connector import SnowflakeConnection
from snowflake.connector.cursor import SnowflakeCursor


@dataclass(frozen=True, slots=True)
class PatchState:
    patch_id: str
    revision: int
    row_version: int
    target_asset_version_id: str
    proposed_content: str


def _calculate_event_hash(
    sequence: int,
    entity_type: str,
    entity_id: str,
    event_type: str,
    actor: str,
    correlation_id: str,
    payload_hash: str,
    previous_hash: str | None,
) -> str:
    value = ":".join(
        [
            str(sequence),
            entity_type,
            entity_id,
            event_type,
            actor,
            correlation_id,
            payload_hash,
            previous_hash or "GENESIS",
        ]
    )
    return sha256(value.encode()).hexdigest()


def _variant(value: object) -> dict[str, Any]:
    parsed = json.loads(value) if isinstance(value, str) else value
    if not isinstance(parsed, dict):
        raise RuntimeError("INVALID_PROCEDURE_RESPONSE")
    return cast(dict[str, Any], parsed)


def _connect(connection_name: str) -> SnowflakeConnection:
    connection: SnowflakeConnection = snowflake.connector.connect(
        connection_name=connection_name
    )
    with connection.cursor() as cursor:
        cursor.execute("USE ROLE RIPPLE_ADMIN_ROLE")
        cursor.execute("USE WAREHOUSE RIPPLE_WH")
    return connection


def _load_patch(cursor: SnowflakeCursor, change_type: str) -> PatchState:
    cursor.execute(
        "SELECT p.patch_id, p.revision, p.row_version, p.target_asset_version_id, "
        "p.proposed_content FROM RIPPLE.APP.PATCH_PROPOSAL AS p JOIN "
        "RIPPLE.PIPELINE.IMPACT_FINDING AS f ON f.finding_id = p.finding_id JOIN "
        "RIPPLE.PIPELINE.CHANGE_ATOM AS a ON a.change_atom_id = f.change_atom_id "
        "WHERE a.change_type = ? AND p.status = 'REVIEW_REQUIRED' "
        "ORDER BY p.created_at DESC LIMIT 1",
        (change_type,),
    )
    row = cursor.fetchone()
    if row is None:
        raise RuntimeError(f"REVIEW_PATCH_MISSING_{change_type}")
    return PatchState(
        cast(str, row[0]),
        int(row[1]),
        int(row[2]),
        cast(str, row[3]),
        cast(str, row[4]),
    )


def _call_revise(
    cursor: SnowflakeCursor,
    state: PatchState,
    *,
    content: str,
    reason: str,
    idempotency_key: str,
) -> dict[str, Any]:
    cursor.execute(
        "CALL RIPPLE.API.REVISE_PATCH(?, ?, ?, ?, ?, ?, ?)",
        (
            state.patch_id,
            state.revision,
            state.row_version,
            content,
            reason,
            idempotency_key,
            "phase4-revise-gate",
        ),
    )
    row = cursor.fetchone()
    if row is None:
        raise RuntimeError("REVISE_RESPONSE_MISSING")
    return _variant(row[0])


def _call_reject(cursor: SnowflakeCursor, state: PatchState, key: str) -> dict[str, Any]:
    cursor.execute(
        "CALL RIPPLE.API.REJECT_PATCH(?, ?, ?, ?, ?, ?)",
        (
            state.patch_id,
            state.revision,
            state.row_version,
            "Not selected for the golden repair path",
            key,
            "phase4-reject-gate",
        ),
    )
    row = cursor.fetchone()
    if row is None:
        raise RuntimeError("REJECT_RESPONSE_MISSING")
    return _variant(row[0])


def _call_apply(
    connection_name: str, state: PatchState, idempotency_key: str, content: str
) -> tuple[str, dict[str, Any]]:
    connection = _connect(connection_name)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "CALL RIPPLE.API.APPLY_PATCH(?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    state.patch_id,
                    state.revision,
                    state.row_version,
                    state.target_asset_version_id,
                    content,
                    "Concurrent gate approval",
                    idempotency_key,
                    f"phase4-apply-{idempotency_key[-8:]}",
                ),
            )
            row = cursor.fetchone()
            if row is None:
                raise RuntimeError("APPLY_RESPONSE_MISSING")
            return idempotency_key, _variant(row[0])
    finally:
        connection.close()


def _call_verify(
    cursor: SnowflakeCursor, patch_id: str, row_version: int, key: str
) -> dict[str, Any]:
    cursor.execute(
        "CALL RIPPLE.API.VERIFY_PATCH(?, ?, ?, ?)",
        (patch_id, row_version, key, "phase4-verify-gate"),
    )
    row = cursor.fetchone()
    if row is None:
        raise RuntimeError("VERIFY_RESPONSE_MISSING")
    return _variant(row[0])


def _verify_audit_chain(cursor: SnowflakeCursor) -> int:
    cursor.execute(
        "SELECT event_sequence, entity_type, entity_id, event_type, actor, correlation_id, "
        "payload_hash, previous_event_hash, event_hash FROM RIPPLE.OPS.AUDIT_EVENT "
        "ORDER BY event_sequence"
    )
    previous_hash: str | None = None
    count = 0
    for row in cursor.fetchall():
        sequence = int(row[0])
        stored_previous_hash = cast(str | None, row[7])
        if sequence == 1 and stored_previous_hash == "None":
            stored_previous_hash = None
        if sequence != count + 1 or stored_previous_hash != previous_hash:
            raise RuntimeError("AUDIT_CHAIN_SEQUENCE_INVALID")
        expected_hash = _calculate_event_hash(
            sequence,
            cast(str, row[1]),
            cast(str, row[2]),
            cast(str, row[3]),
            cast(str, row[4]),
            cast(str, row[5]),
            cast(str, row[6]),
            previous_hash,
        )
        if expected_hash != row[8]:
            raise RuntimeError("AUDIT_CHAIN_HASH_INVALID")
        previous_hash = expected_hash
        count += 1
    cursor.execute(
        "SELECT event_sequence, event_hash FROM RIPPLE.OPS.AUDIT_HEAD WHERE head_name='GLOBAL'"
    )
    head = cursor.fetchone()
    if head is None or int(head[0]) != count or cast(str | None, head[1]) != previous_hash:
        raise RuntimeError("AUDIT_HEAD_MISMATCH")
    return count


def run_gate(connection_name: str) -> dict[str, object]:
    """Execute the destructive-on-fixture Phase 4 gate exactly once."""

    snowflake.connector.paramstyle = "qmark"
    connection = _connect(connection_name)
    try:
        with connection.cursor() as cursor:
            endpoint_patch = _load_patch(cursor, "ENDPOINT_REPLACEMENT")
            reject_key = "phase4rejectkey0000001"
            reject = _call_reject(cursor, endpoint_patch, reject_key)
            reject_replay = _call_reject(cursor, endpoint_patch, reject_key)
            if reject != reject_replay or reject.get("code") != "PATCH_REJECTED":
                raise RuntimeError("REJECT_REPLAY_GATE_FAILED")

            version_patch = _load_patch(cursor, "VERSION_REQUIREMENT")
            revise_key = "phase4revisekey0000001"
            revise = _call_revise(
                cursor,
                version_patch,
                content=version_patch.proposed_content,
                reason="Reviewed without unrelated-content edits",
                idempotency_key=revise_key,
            )
            revise_replay = _call_revise(
                cursor,
                version_patch,
                content=version_patch.proposed_content,
                reason="Reviewed without unrelated-content edits",
                idempotency_key=revise_key,
            )
            revise_conflict = _call_revise(
                cursor,
                version_patch,
                content=f"{version_patch.proposed_content}\n",
                reason="Reviewed without unrelated-content edits",
                idempotency_key=revise_key,
            )
            if (
                revise != revise_replay
                or revise.get("code") != "PATCH_REVISED"
                or revise_conflict.get("code") != "IDEMPOTENCY_CONFLICT"
            ):
                raise RuntimeError("REVISE_REPLAY_GATE_FAILED")
            revised_state = PatchState(
                version_patch.patch_id,
                int(revise["revision"]),
                int(revise["rowVersion"]),
                version_patch.target_asset_version_id,
                version_patch.proposed_content,
            )
    finally:
        connection.close()

    apply_keys = [f"phase4applykey{i:08d}" for i in range(20)]
    with ThreadPoolExecutor(max_workers=20) as executor:
        results = list(
            executor.map(
                lambda key: _call_apply(
                    connection_name, revised_state, key, revised_state.proposed_content
                ),
                apply_keys,
            )
        )
    winners = [(key, result) for key, result in results if result.get("code") == "PATCH_APPLIED"]
    losers = [result for _, result in results if result.get("code") == "PATCH_ALREADY_DECIDED"]
    if len(winners) != 1 or len(losers) != 19:
        codes = sorted(str(result.get("code")) for _, result in results)
        raise RuntimeError(f"CONCURRENCY_GATE_FAILED:{codes}")
    winner_key, winner = winners[0]

    connection = _connect(connection_name)
    try:
        with connection.cursor() as cursor:
            replay_key, apply_replay = _call_apply(
                connection_name, revised_state, winner_key, revised_state.proposed_content
            )
            if replay_key != winner_key or apply_replay != winner:
                raise RuntimeError("APPLY_REPLAY_GATE_FAILED")
            _, apply_conflict = _call_apply(
                connection_name,
                revised_state,
                winner_key,
                f"{revised_state.proposed_content}\n",
            )
            if apply_conflict.get("code") != "IDEMPOTENCY_CONFLICT":
                raise RuntimeError("APPLY_IDEMPOTENCY_CONFLICT_GATE_FAILED")

            verify_key = "phase4verifykey0000001"
            verified = _call_verify(
                cursor, revised_state.patch_id, int(winner["rowVersion"]), verify_key
            )
            verify_replay = _call_verify(
                cursor, revised_state.patch_id, int(winner["rowVersion"]), verify_key
            )
            if verified != verify_replay or verified.get("code") != "PATCH_VERIFIED":
                raise RuntimeError("VERIFY_REPLAY_GATE_FAILED")

            cursor.execute(
                "SELECT p.status, p.applied_asset_version_id, a.current_version_id, "
                "(SELECT COUNT(*) FROM RIPPLE.CORE.ASSET_VERSION v WHERE v.asset_id=p.asset_id "
                "AND v.supersedes_version_id=p.target_asset_version_id), "
                "(SELECT COUNT(*) FROM RIPPLE.APP.REVIEW_DECISION d WHERE d.patch_id=p.patch_id "
                "AND d.decision='APPLY'), "
                "(SELECT COUNT(*) FROM RIPPLE.OPS.AUDIT_EVENT e WHERE e.entity_id=p.patch_id "
                "AND e.event_type='PATCH_APPLIED'), "
                "(SELECT COUNT(*) FROM RIPPLE.APP.PATCH_REVISION r WHERE r.patch_id=p.patch_id), "
                "(SELECT COUNT(*) FROM RIPPLE.APP.VERIFICATION_RESULT v "
                "WHERE v.patch_id=p.patch_id AND v.status='VERIFIED') "
                "FROM RIPPLE.APP.PATCH_PROPOSAL p JOIN RIPPLE.CORE.KNOWLEDGE_ASSET a "
                "ON a.asset_id=p.asset_id WHERE p.patch_id=?",
                (revised_state.patch_id,),
            )
            state = cursor.fetchone()
            expected_counts = (
                1,
                1,
                1,
                2,
                1,
            )
            if (
                state is None
                or state[0] != "VERIFIED"
                or state[1] != state[2]
                or tuple(state[3:]) != expected_counts
            ):
                raise RuntimeError("ATOMIC_STATE_GATE_FAILED")
            audit_event_count = _verify_audit_chain(cursor)
            return {
                "applyLoserCount": len(losers),
                "applyWinnerCount": len(winners),
                "auditChainValid": True,
                "auditEventCount": audit_event_count,
                "ok": True,
                "rejectReplayExact": True,
                "reviseReplayExact": True,
                "verifyReplayExact": True,
                "verifiedPatchCount": 1,
            }
    finally:
        connection.close()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--connection", default="RIPPLE_ADMIN_AUTOMATION")
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    print(json.dumps(run_gate(args.connection), separators=(",", ":"), sort_keys=True))
