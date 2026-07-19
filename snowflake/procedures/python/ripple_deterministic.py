"""Pure deterministic normalization, sectioning, diffing, and P0 token extraction."""

from __future__ import annotations

import re
from dataclasses import dataclass
from hashlib import sha256
from typing import Literal, TypeAlias
from urllib.parse import quote

MAX_SOURCE_BYTES = 1_048_576
MAX_ASSET_BYTES = 262_144
MAX_SECTIONS = 200
MAX_LINE_LENGTH = 10_000
NORMALIZER_VERSION = "ripple-normalizer-v1"

ChangeType: TypeAlias = Literal["VERSION_REQUIREMENT", "ENDPOINT_REPLACEMENT", "NUMERIC_LIMIT"]
DiffStatus: TypeAlias = Literal["ADDED", "REMOVED", "CHANGED", "UNCHANGED"]
SnapshotOutcome: TypeAlias = Literal["NO_CHANGE", "FORMATTING_ONLY", "MATERIAL_CHANGE"]

_HEADING_PATTERN = re.compile(r"^(?P<marks>#{1,6})[ \t]+(?P<label>.*)$")
_HEADING_SCAN_PATTERN = re.compile(r"^(?P<marks>#{1,6}) (?P<label>[^\n]+)$", re.MULTILINE)
_VERSION_PATTERN = re.compile(
    r"(?<![\w/])(?:v\d+(?:\.\d+){0,2}|\d+\.\d+(?:\.\d+)?)(?:\+)?(?![\w.])",
    re.IGNORECASE,
)
_ENDPOINT_PATTERN = re.compile(
    r"\b(?P<method>GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+"
    r"(?P<path>/[A-Za-z0-9._~!$&'()*+,;=:@%\-/{}]+?)(?=$|\s|[.,;:!?])",
    re.IGNORECASE,
)
_NUMERIC_PATTERN = re.compile(
    r"(?P<number>\d[\d,]*(?:\.\d+)?)\s+"
    r"(?P<unit>(?:API\s+)?requests?|calls?|jobs?|users?|MB|GB)"
    r"(?:\s+(?P<period>per|each)\s+(?P<period_unit>day|week|month|year|hour|minute))?",
    re.IGNORECASE,
)


class DeterministicInputError(ValueError):
    """A stable, content-free validation failure for untrusted fixture input."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


@dataclass(frozen=True, slots=True)
class Section:
    """A stable normalized source section with half-open offsets."""

    section_key: str
    ordinal: int
    heading: str
    normalized_text: str
    start_offset: int
    end_offset: int
    text_sha256: str


@dataclass(frozen=True, slots=True)
class SectionDiff:
    """A deterministic section-level diff record."""

    section_key: str
    status: DiffStatus
    old_section: Section | None
    new_section: Section | None


@dataclass(frozen=True, slots=True)
class ParsedToken:
    """A parsed P0 token with evidence offsets relative to its section."""

    raw_text: str
    normalized_value: str
    start_offset: int
    end_offset: int
    parse_status: Literal["PARSED"] = "PARSED"


@dataclass(frozen=True, slots=True)
class ChangeCandidate:
    """A deterministic candidate for one of the three supported change families."""

    change_type: ChangeType
    old_token: ParsedToken
    new_token: ParsedToken


@dataclass(frozen=True, slots=True)
class SnapshotAnalysis:
    """The deterministic result of comparing two raw source snapshots."""

    outcome: SnapshotOutcome
    raw_old_sha256: str
    raw_new_sha256: str
    normalized_old_sha256: str
    normalized_new_sha256: str
    old_sections: tuple[Section, ...]
    new_sections: tuple[Section, ...]
    section_diffs: tuple[SectionDiff, ...]
    change_candidates: tuple[ChangeCandidate, ...]


def hash_bytes(value: bytes) -> str:
    """Return a lowercase SHA-256 hex digest."""

    return sha256(value).hexdigest()


def hash_text(value: str) -> str:
    """Hash UTF-8 text using the canonical lowercase SHA-256 representation."""

    return hash_bytes(value.encode("utf-8"))


def decode_source(raw: bytes) -> str:
    """Validate the P0 source envelope and decode strict UTF-8."""

    if len(raw) > MAX_SOURCE_BYTES:
        raise DeterministicInputError("SOURCE_TOO_LARGE")
    if raw.startswith((b"\xff\xfe", b"\xfe\xff", b"\xff\xfe\x00\x00", b"\x00\x00\xfe\xff")):
        raise DeterministicInputError("UTF8_REQUIRED")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise DeterministicInputError("INVALID_UTF8") from error


def normalize_text(value: str) -> str:
    """Apply the intentionally narrow, semantics-preserving P0 normalizer."""

    normalized_newlines = value.replace("\r\n", "\n").replace("\r", "\n")
    output_lines: list[str] = []
    blank_run = 0

    for original_line in normalized_newlines.split("\n"):
        line = original_line.rstrip(" \t")
        heading_match = _HEADING_PATTERN.fullmatch(line)
        if heading_match is not None:
            label = heading_match.group("label").strip()
            line = (
                f"{heading_match.group('marks')} {label}" if label else heading_match.group("marks")
            )

        if len(line) > MAX_LINE_LENGTH:
            raise DeterministicInputError("LINE_TOO_LONG")
        if line == "":
            blank_run += 1
            if blank_run > 2:
                continue
        else:
            blank_run = 0
        output_lines.append(line)

    return "\n".join(output_lines)


def normalize_source(raw: bytes) -> str:
    """Decode and normalize a P0 source snapshot."""

    return normalize_text(decode_source(raw))


def _slug(value: str) -> str:
    collapsed = re.sub(r"\s+", "-", value.strip().lower())
    encoded = quote(collapsed, safe="-._~")
    return encoded or "untitled"


def _make_section(
    *, heading: str, ordinal: int, section_key: str, start: int, end: int, text: str
) -> Section:
    normalized_text = text[start:end]
    return Section(
        section_key=section_key,
        ordinal=ordinal,
        heading=heading,
        normalized_text=normalized_text,
        start_offset=start,
        end_offset=end,
        text_sha256=hash_text(normalized_text),
    )


def _markdown_sections(value: str, matches: list[re.Match[str]]) -> tuple[Section, ...]:
    sections: list[Section] = []
    heading_path: list[str] = []

    first_heading_start = matches[0].start()
    if value[:first_heading_start].strip():
        sections.append(
            _make_section(
                heading="Document introduction",
                ordinal=0,
                section_key="document-introduction::0000",
                start=0,
                end=first_heading_start,
                text=value,
            )
        )

    for match_index, match in enumerate(matches):
        level = len(match.group("marks"))
        label = match.group("label").strip()
        heading_path[level - 1 :] = [label]
        path_label = " / ".join(heading_path)
        end = matches[match_index + 1].start() if match_index + 1 < len(matches) else len(value)
        ordinal = len(sections)
        sections.append(
            _make_section(
                heading=path_label,
                ordinal=ordinal,
                section_key=f"{_slug(path_label)}::{ordinal:04d}",
                start=match.start(),
                end=end,
                text=value,
            )
        )

    return tuple(sections)


def _plain_text_sections(value: str) -> tuple[Section, ...]:
    sections: list[Section] = []
    start = 0
    separators = list(re.finditer(r"\n{2,}", value))
    boundaries = [separator.start() for separator in separators] + [len(value)]

    for boundary_index, end in enumerate(boundaries):
        candidate = value[start:end]
        if candidate.strip():
            ordinal = len(sections)
            heading = candidate.split("\n", 1)[0][:120]
            sections.append(
                _make_section(
                    heading=heading,
                    ordinal=ordinal,
                    section_key=f"paragraph::{ordinal:04d}",
                    start=start,
                    end=end,
                    text=value,
                )
            )
        if boundary_index < len(separators):
            start = separators[boundary_index].end()

    return tuple(sections)


def section_text(value: str) -> tuple[Section, ...]:
    """Split normalized Markdown or plain text while preserving exact offsets."""

    heading_matches = list(_HEADING_SCAN_PATTERN.finditer(value))
    sections = (
        _markdown_sections(value, heading_matches)
        if heading_matches
        else _plain_text_sections(value)
    )
    if len(sections) > MAX_SECTIONS:
        raise DeterministicInputError("TOO_MANY_SECTIONS")
    return sections


def diff_sections(
    old_sections: tuple[Section, ...], new_sections: tuple[Section, ...]
) -> tuple[SectionDiff, ...]:
    """Match sections by stable key and classify deterministic section status."""

    old_by_key = {section.section_key: section for section in old_sections}
    new_by_key = {section.section_key: section for section in new_sections}
    ordered_keys = list(old_by_key)
    ordered_keys.extend(key for key in new_by_key if key not in old_by_key)
    diffs: list[SectionDiff] = []

    for key in ordered_keys:
        old_section = old_by_key.get(key)
        new_section = new_by_key.get(key)
        if old_section is None:
            status: DiffStatus = "ADDED"
        elif new_section is None:
            status = "REMOVED"
        elif old_section.text_sha256 == new_section.text_sha256:
            status = "UNCHANGED"
        else:
            status = "CHANGED"
        diffs.append(
            SectionDiff(
                section_key=key,
                status=status,
                old_section=old_section,
                new_section=new_section,
            )
        )
    return tuple(diffs)


def parse_versions(value: str) -> tuple[ParsedToken, ...]:
    """Parse dotted or v-prefixed version tokens without matching endpoint segments."""

    return tuple(
        ParsedToken(
            raw_text=match.group(0),
            normalized_value=match.group(0).lower().removeprefix("v"),
            start_offset=match.start(),
            end_offset=match.end(),
        )
        for match in _VERSION_PATTERN.finditer(value)
    )


def parse_endpoints(value: str) -> tuple[ParsedToken, ...]:
    """Parse HTTP method and path pairs."""

    return tuple(
        ParsedToken(
            raw_text=match.group(0),
            normalized_value=f"{match.group('method').upper()} {match.group('path')}",
            start_offset=match.start(),
            end_offset=match.end(),
        )
        for match in _ENDPOINT_PATTERN.finditer(value)
    )


def parse_numeric_limits(value: str) -> tuple[ParsedToken, ...]:
    """Parse bounded numeric limit expressions while preserving unit and period."""

    tokens: list[ParsedToken] = []
    for match in _NUMERIC_PATTERN.finditer(value):
        normalized_number = match.group("number").replace(",", "")
        unit = re.sub(r"\s+", " ", match.group("unit").lower())
        period = ""
        if match.group("period") and match.group("period_unit"):
            period = f"|{match.group('period').lower()} {match.group('period_unit').lower()}"
        tokens.append(
            ParsedToken(
                raw_text=match.group(0),
                normalized_value=f"{normalized_number}|{unit}{period}",
                start_offset=match.start(),
                end_offset=match.end(),
            )
        )
    return tuple(tokens)


def _first_new_value(
    old_tokens: tuple[ParsedToken, ...], new_tokens: tuple[ParsedToken, ...]
) -> tuple[ParsedToken, ParsedToken] | None:
    old_values = {token.normalized_value for token in old_tokens}
    new_values = {token.normalized_value for token in new_tokens}
    old_only = [token for token in old_tokens if token.normalized_value not in new_values]
    new_only = [token for token in new_tokens if token.normalized_value not in old_values]
    if old_only and new_only:
        return old_only[0], new_only[0]
    return None


def extract_change_candidates(old_text: str, new_text: str) -> tuple[ChangeCandidate, ...]:
    """Extract at most one deterministic candidate for each supported change family."""

    candidates: list[ChangeCandidate] = []

    version_pair = _first_new_value(parse_versions(old_text), parse_versions(new_text))
    if version_pair is not None:
        candidates.append(ChangeCandidate("VERSION_REQUIREMENT", *version_pair))

    old_endpoints = parse_endpoints(old_text)
    new_endpoints = parse_endpoints(new_text)
    endpoint_pair = _first_new_value(old_endpoints, new_endpoints)
    if endpoint_pair is None and "deprecated" in new_text.lower():
        old_values = {token.normalized_value for token in old_endpoints}
        added_endpoints = [
            token for token in new_endpoints if token.normalized_value not in old_values
        ]
        if old_endpoints and added_endpoints:
            endpoint_pair = old_endpoints[0], added_endpoints[0]
    if endpoint_pair is not None:
        candidates.append(ChangeCandidate("ENDPOINT_REPLACEMENT", *endpoint_pair))

    numeric_pair = _first_new_value(parse_numeric_limits(old_text), parse_numeric_limits(new_text))
    if numeric_pair is not None:
        candidates.append(ChangeCandidate("NUMERIC_LIMIT", *numeric_pair))

    return tuple(candidates)


def analyze_snapshot_pair(old_raw: bytes, new_raw: bytes) -> SnapshotAnalysis:
    """Run the complete deterministic first pass for one old/new snapshot pair."""

    old_raw_hash = hash_bytes(old_raw)
    new_raw_hash = hash_bytes(new_raw)
    old_normalized = normalize_source(old_raw)
    new_normalized = normalize_source(new_raw)
    old_normalized_hash = hash_text(old_normalized)
    new_normalized_hash = hash_text(new_normalized)
    old_sections = section_text(old_normalized)
    new_sections = section_text(new_normalized)

    if old_raw_hash == new_raw_hash:
        outcome: SnapshotOutcome = "NO_CHANGE"
    elif old_normalized_hash == new_normalized_hash:
        outcome = "FORMATTING_ONLY"
    else:
        outcome = "MATERIAL_CHANGE"

    diffs = diff_sections(old_sections, new_sections)
    candidates: list[ChangeCandidate] = []
    if outcome == "MATERIAL_CHANGE":
        for section_diff in diffs:
            if (
                section_diff.status == "CHANGED"
                and section_diff.old_section is not None
                and section_diff.new_section is not None
            ):
                candidates.extend(
                    extract_change_candidates(
                        section_diff.old_section.normalized_text,
                        section_diff.new_section.normalized_text,
                    )
                )
                if len(candidates) >= 3:
                    break

    return SnapshotAnalysis(
        outcome=outcome,
        raw_old_sha256=old_raw_hash,
        raw_new_sha256=new_raw_hash,
        normalized_old_sha256=old_normalized_hash,
        normalized_new_sha256=new_normalized_hash,
        old_sections=old_sections,
        new_sections=new_sections,
        section_diffs=diffs,
        change_candidates=tuple(candidates[:3]),
    )
