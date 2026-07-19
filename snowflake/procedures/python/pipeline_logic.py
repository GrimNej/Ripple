"""Pure P0 retrieval, evidence, severity, and verification policy."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal, TypeAlias

from ripple_deterministic import (
    ChangeType,
    hash_text,
    parse_endpoints,
    parse_numeric_limits,
    parse_versions,
)

RetrievalBasis: TypeAlias = Literal["EXPLICIT_DEPENDENCY", "EXACT_TOKEN", "LEXICAL"]
FindingStatus: TypeAlias = Literal["CONFIRMED", "REJECTED", "UNCERTAIN"]
Severity: TypeAlias = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]

MAX_CANDIDATES_PER_ATOM = 5
MAX_CANDIDATES_PER_EVENT = 12

_WORD_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/-]*")
_BASIS_WEIGHT: dict[RetrievalBasis, int] = {
    "EXPLICIT_DEPENDENCY": 3,
    "EXACT_TOKEN": 2,
    "LEXICAL": 1,
}
_CHANGE_WEIGHT: dict[ChangeType, float] = {
    "ENDPOINT_REPLACEMENT": 1.5,
    "VERSION_REQUIREMENT": 1.2,
    "NUMERIC_LIMIT": 1.0,
}
_CRITICALITY_WEIGHT = {"LOW": 0.8, "MEDIUM": 1.0, "HIGH": 1.3, "CRITICAL": 1.6}


@dataclass(frozen=True, slots=True)
class AtomInput:
    change_atom_id: str
    change_type: ChangeType
    old_claim: str
    new_claim: str
    source_section_key: str


@dataclass(frozen=True, slots=True)
class AssetInput:
    asset_id: str
    asset_version_id: str
    asset_type: str
    criticality: str
    content: str


@dataclass(frozen=True, slots=True)
class Candidate:
    atom: AtomInput
    asset: AssetInput
    basis: RetrievalBasis
    retrieval_score: float


@dataclass(frozen=True, slots=True)
class EvidenceSpan:
    start_offset: int
    end_offset: int
    quote_sha256: str


def _words(value: str) -> set[str]:
    words: set[str] = set()
    for match in _WORD_PATTERN.finditer(value):
        token = match.group(0).lower()
        words.add(token)
        words.update(part for part in re.split(r"[._/-]+", token) if len(part) >= 2)
    return words


def _exact_obsolete_match(atom: AtomInput, content: str) -> bool:
    if atom.change_type == "ENDPOINT_REPLACEMENT":
        expected = {token.normalized_value for token in parse_endpoints(atom.old_claim)}
        actual = {token.normalized_value for token in parse_endpoints(content)}
        if expected & actual:
            return True
        if expected:
            method, path = next(iter(expected)).split(" ", 1)
            return method in content.upper() and path in content
        return False
    if atom.change_type == "VERSION_REQUIREMENT":
        expected = {token.normalized_value for token in parse_versions(atom.old_claim)}
        actual = {token.normalized_value for token in parse_versions(content)}
        return bool(expected & actual)
    expected = {token.normalized_value for token in parse_numeric_limits(atom.old_claim)}
    actual = {token.normalized_value for token in parse_numeric_limits(content)}
    return bool(expected & actual)


def retrieve_candidates(
    atoms: tuple[AtomInput, ...],
    assets: tuple[AssetInput, ...],
    explicit_dependencies: set[tuple[str, str]],
) -> tuple[Candidate, ...]:
    """Retrieve explicit, exact, then lexical candidates under the frozen P0 caps."""

    candidates_by_asset: dict[str, Candidate] = {}
    for atom in atoms:
        per_atom: list[Candidate] = []
        atom_words = _words(f"{atom.old_claim} {atom.new_claim}")
        for asset in assets:
            dependency_key = (atom.source_section_key, asset.asset_id)
            if dependency_key in explicit_dependencies:
                basis: RetrievalBasis = "EXPLICIT_DEPENDENCY"
                score = 3.0
            elif _exact_obsolete_match(atom, asset.content):
                basis = "EXACT_TOKEN"
                score = 2.0
            else:
                overlap = atom_words & _words(asset.content)
                if not overlap:
                    continue
                basis = "LEXICAL"
                score = min(1.0, 0.35 + (0.15 * len(overlap)))
            per_atom.append(Candidate(atom=atom, asset=asset, basis=basis, retrieval_score=score))

        per_atom.sort(
            key=lambda candidate: (
                -_BASIS_WEIGHT[candidate.basis],
                -candidate.retrieval_score,
                candidate.asset.asset_id,
            )
        )
        eligible = [
            candidate
            for candidate in per_atom
            if (existing := candidates_by_asset.get(candidate.asset.asset_id)) is None
            or _BASIS_WEIGHT[candidate.basis] > _BASIS_WEIGHT[existing.basis]
        ]
        for candidate in eligible[:MAX_CANDIDATES_PER_ATOM]:
            existing = candidates_by_asset.get(candidate.asset.asset_id)
            if existing is None or _BASIS_WEIGHT[candidate.basis] > _BASIS_WEIGHT[existing.basis]:
                candidates_by_asset[candidate.asset.asset_id] = candidate

    ordered = sorted(
        candidates_by_asset.values(),
        key=lambda candidate: (
            -_BASIS_WEIGHT[candidate.basis],
            -candidate.retrieval_score,
            candidate.asset.asset_id,
        ),
    )
    return tuple(ordered[:MAX_CANDIDATES_PER_EVENT])


def find_asset_evidence(atom: AtomInput, content: str) -> EvidenceSpan | None:
    """Find a deterministic obsolete-claim span in one downstream asset."""

    if atom.change_type == "ENDPOINT_REPLACEMENT":
        old_endpoints = parse_endpoints(atom.old_claim)
        if not old_endpoints:
            return None
        expected = old_endpoints[0].normalized_value
        for token in parse_endpoints(content):
            if token.normalized_value == expected:
                return EvidenceSpan(token.start_offset, token.end_offset, hash_text(token.raw_text))
        method, path = expected.split(" ", 1)
        method_match = re.search(rf"\b{re.escape(method)}\b", content, re.IGNORECASE)
        path_start = content.find(path)
        if method_match is not None and path_start >= 0:
            start = min(method_match.start(), path_start)
            end = max(method_match.end(), path_start + len(path))
            return EvidenceSpan(start, end, hash_text(content[start:end]))
        return None

    parser = parse_versions if atom.change_type == "VERSION_REQUIREMENT" else parse_numeric_limits
    expected_tokens = parser(atom.old_claim)
    expected_values = {token.normalized_value for token in expected_tokens}
    for token in parser(content):
        if token.normalized_value in expected_values:
            return EvidenceSpan(token.start_offset, token.end_offset, hash_text(token.raw_text))
    return None


def validate_evidence_span(content: str, evidence: EvidenceSpan) -> bool:
    """Validate half-open bounds and the exact quote hash."""

    if not 0 <= evidence.start_offset < evidence.end_offset <= len(content):
        return False
    return hash_text(content[evidence.start_offset : evidence.end_offset]) == evidence.quote_sha256


def decide_finding_status(candidate: Candidate, evidence: EvidenceSpan | None) -> FindingStatus:
    """Apply the evidence-first P0 decision policy; AI remains an advisory signal."""

    if evidence is not None and validate_evidence_span(candidate.asset.content, evidence):
        return "CONFIRMED"
    if candidate.basis != "LEXICAL":
        return "UNCERTAIN"

    atom = candidate.atom
    if atom.change_type == "ENDPOINT_REPLACEMENT":
        concrete = parse_endpoints(candidate.asset.content)
        if concrete:
            return "REJECTED"
        if (
            "endpoint" in candidate.asset.content.lower()
            or "jobs" in candidate.asset.content.lower()
        ):
            return "UNCERTAIN"
    elif (
        atom.change_type == "VERSION_REQUIREMENT" and parse_versions(candidate.asset.content)
    ) or (atom.change_type == "NUMERIC_LIMIT" and parse_numeric_limits(candidate.asset.content)):
        return "REJECTED"
    return "UNCERTAIN"


def calculate_severity(
    candidate: Candidate, evidence: EvidenceSpan | None
) -> tuple[Severity, float]:
    """Calculate frozen deterministic severity from documented factors and thresholds."""

    criticality = _CRITICALITY_WEIGHT.get(candidate.asset.criticality, 1.0)
    workflow_multiplier = 1.5 if candidate.asset.asset_type == "WORKFLOW" else 1.0
    evidence_factor = 1.0 if evidence is not None else 0.9
    score = round(
        _CHANGE_WEIGHT[candidate.atom.change_type]
        * criticality
        * workflow_multiplier
        * evidence_factor,
        4,
    )
    if score >= 2.4:
        severity: Severity = "CRITICAL"
    elif score >= 1.6:
        severity = "HIGH"
    elif score >= 1.0:
        severity = "MEDIUM"
    else:
        severity = "LOW"
    return severity, score
