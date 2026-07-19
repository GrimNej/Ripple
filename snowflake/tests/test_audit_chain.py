from audit_chain import calculate_event_hash, canonical_json
from ripple_deterministic import hash_text


def test_audit_event_hash_is_canonical_and_chained() -> None:
    payload_hash = hash_text(canonical_json({"b": 2, "a": 1}))
    first = calculate_event_hash(
        event_sequence=1,
        entity_type="PATCH_PROPOSAL",
        entity_id="patch-1",
        event_type="PATCH_APPLIED",
        actor="operator",
        correlation_id="correlation-1",
        payload_hash=payload_hash,
        previous_event_hash=None,
    )
    second = calculate_event_hash(
        event_sequence=2,
        entity_type="PATCH_PROPOSAL",
        entity_id="patch-1",
        event_type="PATCH_VERIFIED",
        actor="operator",
        correlation_id="correlation-1",
        payload_hash=payload_hash,
        previous_event_hash=first,
    )

    assert first != second
    assert first == calculate_event_hash(
        event_sequence=1,
        entity_type="PATCH_PROPOSAL",
        entity_id="patch-1",
        event_type="PATCH_APPLIED",
        actor="operator",
        correlation_id="correlation-1",
        payload_hash=payload_hash,
        previous_event_hash=None,
    )
