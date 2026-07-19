"""Pure deterministic patch verification for Ripple's three bounded change families."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, TypeAlias

from pipeline_logic import EvidenceSpan, validate_evidence_span
from ripple_deterministic import (
    ChangeType,
    hash_text,
    parse_endpoints,
    parse_numeric_limits,
    parse_versions,
)

VerificationStatus: TypeAlias = Literal["VERIFIED", "FAILED", "HUMAN_REQUIRED"]


@dataclass(frozen=True, slots=True)
class VerificationInput:
    """Trusted identifiers plus untrusted content required for deterministic verification."""

    change_type: ChangeType
    old_claim: str
    new_claim: str
    original_content: str
    approved_content: str
    evidence: EvidenceSpan
    benchmark_expected_status: str | None
    benchmark_authored_before_model: bool | None


@dataclass(frozen=True, slots=True)
class VerificationOutcome:
    """Stable verification state and content-free named checks."""

    status: VerificationStatus
    checks: tuple[tuple[str, bool], ...]
    original_unrelated_sha256: str
    approved_unrelated_sha256: str


def _normalized_values(change_type: ChangeType, value: str) -> set[str]:
    if change_type == "VERSION_REQUIREMENT":
        tokens = parse_versions(value)
    elif change_type == "ENDPOINT_REPLACEMENT":
        tokens = parse_endpoints(value)
    else:
        tokens = parse_numeric_limits(value)
    return {token.normalized_value for token in tokens}


def verify_patch(value: VerificationInput) -> VerificationOutcome:
    """Verify a patch without AI; only these checks can authorize ``VERIFIED``."""

    evidence_valid = validate_evidence_span(value.original_content, value.evidence)
    old_values = _normalized_values(value.change_type, value.old_claim)
    new_values = _normalized_values(value.change_type, value.new_claim)
    parseable = bool(old_values) and bool(new_values)

    start = value.evidence.start_offset
    end = value.evidence.end_offset
    prefix = value.original_content[:start]
    suffix = value.original_content[end:]
    expected_span_only = (
        len(value.approved_content) >= len(prefix) + len(suffix)
        and value.approved_content.startswith(prefix)
        and value.approved_content.endswith(suffix)
    )

    original_unrelated = hash_text(f"{prefix}\0{suffix}")
    if expected_span_only:
        approved_prefix = value.approved_content[: len(prefix)]
        approved_suffix = value.approved_content[-len(suffix) :] if suffix else ""
        approved_unrelated = hash_text(f"{approved_prefix}\0{approved_suffix}")
    else:
        approved_unrelated = hash_text(value.approved_content)
    unrelated_unchanged = expected_span_only and approved_unrelated == original_unrelated

    approved_values = _normalized_values(value.change_type, value.approved_content)
    obsolete_absent = bool(old_values) and old_values.isdisjoint(approved_values)
    required_present = bool(new_values) and new_values.issubset(approved_values)
    semantic_match = parseable and obsolete_absent and required_present
    benchmark_consistent = value.benchmark_expected_status in (None, "CONFIRMED") and (
        value.benchmark_authored_before_model in (None, True)
    )

    checks = (
        ("EVIDENCE_HASH_VALID", evidence_valid),
        ("EXPECTED_SPAN_ONLY", expected_span_only),
        ("UNRELATED_CONTENT_UNCHANGED", unrelated_unchanged),
        ("OBSOLETE_TOKEN_ABSENT", obsolete_absent),
        ("REQUIRED_TOKEN_PRESENT", required_present),
        ("SEMANTIC_VALUE_MATCH", semantic_match),
        ("BENCHMARK_EXPECTATION_CONSISTENT", benchmark_consistent),
    )
    if not evidence_valid or not parseable:
        status: VerificationStatus = "HUMAN_REQUIRED"
    elif all(passed for _, passed in checks):
        status = "VERIFIED"
    else:
        status = "FAILED"
    return VerificationOutcome(status, checks, original_unrelated, approved_unrelated)
