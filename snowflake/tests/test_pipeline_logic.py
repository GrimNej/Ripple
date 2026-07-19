from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

from pipeline_logic import (
    AssetInput,
    AtomInput,
    calculate_severity,
    decide_finding_status,
    find_asset_evidence,
    retrieve_candidates,
    validate_evidence_span,
)

ROOT = Path(__file__).resolve().parents[2]


def _golden_inputs() -> tuple[tuple[AtomInput, ...], tuple[AssetInput, ...], set[tuple[str, str]]]:
    manifest = cast(
        dict[str, Any], json.loads((ROOT / "benchmark" / "manifest.json").read_text("utf-8"))
    )
    atoms = (
        AtomInput(
            "atom-version",
            "VERSION_REQUIREMENT",
            "3.10",
            "3.12",
            "runtime-requirements::0000",
        ),
        AtomInput(
            "atom-endpoint",
            "ENDPOINT_REPLACEMENT",
            "POST /v1/jobs",
            "POST /v2/jobs",
            "jobs-api::0001",
        ),
        AtomInput(
            "atom-limit",
            "NUMERIC_LIMIT",
            "10,000 API requests per month",
            "5,000 API requests per month",
            "free-plan::0002",
        ),
    )
    assets: list[AssetInput] = []
    explicit: set[tuple[str, str]] = set()
    for record in manifest["assets"]:
        content = (ROOT / record["path"]).read_text("utf-8")
        assets.append(
            AssetInput(
                asset_id=record["assetId"],
                asset_version_id=record["versionId"],
                asset_type=record["assetType"],
                criticality=record["criticality"],
                content=content,
            )
        )
        if "sourceSectionKey" in record:
            explicit.add((record["sourceSectionKey"], record["assetId"]))
    return atoms, tuple(assets), explicit


def test_golden_retrieval_and_evidence_policy_matches_frozen_labels() -> None:
    atoms, assets, explicit = _golden_inputs()
    candidates = retrieve_candidates(atoms, assets, explicit)

    decisions = {
        candidate.asset.asset_id: decide_finding_status(
            candidate, find_asset_evidence(candidate.atom, candidate.asset.content)
        )
        for candidate in candidates
    }
    assert len(candidates) == 8
    assert list(decisions.values()).count("CONFIRMED") == 6
    assert list(decisions.values()).count("UNCERTAIN") == 1
    assert list(decisions.values()).count("REJECTED") == 1


def test_every_confirmed_evidence_span_round_trips() -> None:
    atoms, assets, explicit = _golden_inputs()
    for candidate in retrieve_candidates(atoms, assets, explicit):
        evidence = find_asset_evidence(candidate.atom, candidate.asset.content)
        if evidence is not None:
            assert validate_evidence_span(candidate.asset.content, evidence)


def test_severity_is_deterministic_and_workflow_sensitive() -> None:
    atoms, assets, explicit = _golden_inputs()
    candidates = retrieve_candidates(atoms, assets, explicit)
    severities = {
        candidate.asset.asset_id: calculate_severity(
            candidate, find_asset_evidence(candidate.atom, candidate.asset.content)
        )
        for candidate in candidates
    }

    assert severities["asset-nightly-workflow"][1] > severities["asset-jobs-troubleshooting"][1]
    assert (
        calculate_severity(
            next(
                candidate
                for candidate in candidates
                if candidate.asset.asset_id == "asset-sdk-readme"
            ),
            find_asset_evidence(
                next(
                    candidate
                    for candidate in candidates
                    if candidate.asset.asset_id == "asset-sdk-readme"
                ).atom,
                next(
                    candidate
                    for candidate in candidates
                    if candidate.asset.asset_id == "asset-sdk-readme"
                ).asset.content,
            ),
        )
        == severities["asset-sdk-readme"]
    )


def test_tampered_evidence_hash_is_rejected() -> None:
    atoms, assets, explicit = _golden_inputs()
    candidate = retrieve_candidates(atoms, assets, explicit)[0]
    evidence = find_asset_evidence(candidate.atom, candidate.asset.content)

    assert evidence is not None
    tampered = type(evidence)(evidence.start_offset, evidence.end_offset, "0" * 64)
    assert not validate_evidence_span(candidate.asset.content, tampered)
