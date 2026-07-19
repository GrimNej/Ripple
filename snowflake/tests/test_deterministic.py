from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st
from ripple_deterministic import (
    MAX_LINE_LENGTH,
    MAX_SOURCE_BYTES,
    DeterministicInputError,
    analyze_snapshot_pair,
    decode_source,
    normalize_text,
    parse_endpoints,
    parse_numeric_limits,
    parse_versions,
    section_text,
)

BASELINE = b"""# Runtime requirements

Python 3.10 and newer are supported.

# Jobs API

Create jobs using POST /v1/jobs.

# Free plan

The free plan allows 10,000 API requests per month.
"""

UPDATED = b"""# Runtime requirements

Python 3.12 and newer are required beginning August 1, 2026.

# Jobs API

POST /v1/jobs is deprecated. New integrations must use POST /v2/jobs.

# Free plan

The free plan allows 5,000 API requests per month.
"""


def test_golden_pair_extracts_exactly_three_supported_changes() -> None:
    analysis = analyze_snapshot_pair(BASELINE, UPDATED)

    assert analysis.outcome == "MATERIAL_CHANGE"
    assert [candidate.change_type for candidate in analysis.change_candidates] == [
        "VERSION_REQUIREMENT",
        "ENDPOINT_REPLACEMENT",
        "NUMERIC_LIMIT",
    ]
    assert [diff.status for diff in analysis.section_diffs] == [
        "CHANGED",
        "CHANGED",
        "CHANGED",
    ]
    assert analysis.change_candidates[0].old_token.normalized_value == "3.10"
    assert analysis.change_candidates[0].new_token.normalized_value == "3.12"
    assert analysis.change_candidates[1].old_token.normalized_value == "POST /v1/jobs"
    assert analysis.change_candidates[1].new_token.normalized_value == "POST /v2/jobs"
    assert analysis.change_candidates[2].old_token.normalized_value.startswith("10000|")
    assert analysis.change_candidates[2].new_token.normalized_value.startswith("5000|")


def test_formatting_only_change_finishes_without_candidates() -> None:
    old = b"# Heading\r\n\r\nValue\t\r\n"
    new = b"#   Heading\n\nValue\n"
    analysis = analyze_snapshot_pair(old, new)

    assert analysis.outcome == "FORMATTING_ONLY"
    assert analysis.change_candidates == ()


def test_no_change_finishes_without_material_work() -> None:
    analysis = analyze_snapshot_pair(BASELINE, BASELINE)

    assert analysis.outcome == "NO_CHANGE"
    assert analysis.change_candidates == ()


def test_markdown_sections_preserve_hierarchy_offsets_and_hashes() -> None:
    value = normalize_text("# Parent\nBody\n\n## Child\nMore\n")
    sections = section_text(value)

    assert [section.heading for section in sections] == ["Parent", "Parent / Child"]
    assert [section.ordinal for section in sections] == [0, 1]
    for section in sections:
        assert section.normalized_text == value[section.start_offset : section.end_offset]
        assert len(section.text_sha256) == 64


def test_plain_text_sections_split_paragraph_groups() -> None:
    value = "First line\ncontinued\n\nSecond paragraph"
    sections = section_text(value)

    assert [section.normalized_text for section in sections] == [
        "First line\ncontinued",
        "Second paragraph",
    ]
    assert [section.section_key for section in sections] == [
        "paragraph::0000",
        "paragraph::0001",
    ]


def test_normalizer_preserves_semantic_tokens_and_bounds_blank_lines() -> None:
    value = "##   Limits  \r\n5,000 requests/month   \r\n\r\n\r\n\r\nPOST /v2/jobs\r\n"
    normalized = normalize_text(value)

    assert normalized == "## Limits\n5,000 requests/month\n\n\nPOST /v2/jobs\n"


@pytest.mark.parametrize(
    ("raw", "code"),
    [
        (b"\xff\xfeinvalid", "UTF8_REQUIRED"),
        (b"\x80invalid", "INVALID_UTF8"),
        (b"a" * (MAX_SOURCE_BYTES + 1), "SOURCE_TOO_LARGE"),
    ],
    ids=["utf16-bom", "invalid-utf8", "source-too-large"],
)
def test_invalid_source_envelopes_have_stable_codes(raw: bytes, code: str) -> None:
    with pytest.raises(DeterministicInputError, match=code):
        decode_source(raw)


def test_line_limit_is_enforced_after_normalization() -> None:
    with pytest.raises(DeterministicInputError, match="LINE_TOO_LONG"):
        normalize_text("x" * (MAX_LINE_LENGTH + 1))


def test_section_limit_is_enforced() -> None:
    value = "\n".join(f"# Heading {index}" for index in range(201))
    with pytest.raises(DeterministicInputError, match="TOO_MANY_SECTIONS"):
        section_text(value)


def test_parsers_return_exact_half_open_offsets() -> None:
    value = "Python 3.12+ uses POST /v2/jobs. Limit: 5,000 API requests per month."
    tokens = (*parse_versions(value), *parse_endpoints(value), *parse_numeric_limits(value))

    assert tokens
    for token in tokens:
        assert value[token.start_offset : token.end_offset] == token.raw_text
    assert parse_endpoints(value)[0].normalized_value == "POST /v2/jobs"


@given(st.text(max_size=500))
def test_normalization_is_idempotent(value: str) -> None:
    try:
        once = normalize_text(value)
    except DeterministicInputError:
        return
    assert normalize_text(once) == once


@given(st.text(max_size=500))
def test_every_plain_section_span_round_trips(value: str) -> None:
    try:
        normalized = normalize_text(value)
        sections = section_text(normalized)
    except DeterministicInputError:
        return
    for section in sections:
        assert 0 <= section.start_offset <= section.end_offset <= len(normalized)
        assert section.normalized_text == normalized[section.start_offset : section.end_offset]


@given(st.text(max_size=500))
def test_every_parser_span_round_trips(value: str) -> None:
    for parser in (parse_versions, parse_endpoints, parse_numeric_limits):
        for token in parser(value):
            assert 0 <= token.start_offset < token.end_offset <= len(value)
            assert value[token.start_offset : token.end_offset] == token.raw_text
