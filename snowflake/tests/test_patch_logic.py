from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

from patch_logic import VerificationInput, verify_patch
from pipeline_logic import AssetInput, AtomInput, find_asset_evidence, retrieve_candidates

ROOT = Path(__file__).resolve().parents[2]


def _golden_verification_inputs() -> tuple[VerificationInput, ...]:
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
    labels = {
        cast(str, row["assetId"]): cast(str, row["expectedStatus"])
        for row in manifest["assets"]
    }
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

    values: list[VerificationInput] = []
    selected_types: set[str] = set()
    for candidate in retrieve_candidates(atoms, tuple(assets), explicit):
        evidence = find_asset_evidence(candidate.atom, candidate.asset.content)
        if evidence is None or candidate.atom.change_type in selected_types:
            continue
        original = candidate.asset.content
        if candidate.atom.change_type == "ENDPOINT_REPLACEMENT":
            approved = original.replace("/v1/jobs", "/v2/jobs", 1)
        else:
            approved = (
                original[: evidence.start_offset]
                + candidate.atom.new_claim
                + original[evidence.end_offset :]
            )
        values.append(
            VerificationInput(
                candidate.atom.change_type,
                candidate.atom.old_claim,
                candidate.atom.new_claim,
                original,
                approved,
                evidence,
                labels[candidate.asset.asset_id],
                True,
            )
        )
        selected_types.add(candidate.atom.change_type)
    return tuple(values)


def test_all_three_golden_patch_families_verify_deterministically() -> None:
    outcomes = [verify_patch(value) for value in _golden_verification_inputs()]

    assert len(outcomes) == 3
    assert {outcome.status for outcome in outcomes} == {"VERIFIED"}
    assert all(all(passed for _, passed in outcome.checks) for outcome in outcomes)


def test_unrelated_reviewer_edit_fails_expected_span_check() -> None:
    value = _golden_verification_inputs()[0]
    tampered = VerificationInput(
        value.change_type,
        value.old_claim,
        value.new_claim,
        value.original_content,
        f"Reviewer preface\n{value.approved_content}",
        value.evidence,
        value.benchmark_expected_status,
        value.benchmark_authored_before_model,
    )

    outcome = verify_patch(tampered)
    assert outcome.status == "FAILED"
    assert ("EXPECTED_SPAN_ONLY", False) in outcome.checks


def test_missing_required_value_fails_verification() -> None:
    value = _golden_verification_inputs()[1]
    outcome = verify_patch(
        VerificationInput(
            value.change_type,
            value.old_claim,
            value.new_claim,
            value.original_content,
            value.original_content.replace("/v1/jobs", "/v3/jobs", 1),
            value.evidence,
            value.benchmark_expected_status,
            value.benchmark_authored_before_model,
        )
    )

    assert outcome.status == "FAILED"
    assert ("REQUIRED_TOKEN_PRESENT", False) in outcome.checks


def test_tampered_evidence_requires_human_verification() -> None:
    value = _golden_verification_inputs()[2]
    evidence = type(value.evidence)(
        value.evidence.start_offset, value.evidence.end_offset, "0" * 64
    )
    outcome = verify_patch(
        VerificationInput(
            value.change_type,
            value.old_claim,
            value.new_claim,
            value.original_content,
            value.approved_content,
            evidence,
            value.benchmark_expected_status,
            value.benchmark_authored_before_model,
        )
    )

    assert outcome.status == "HUMAN_REQUIRED"


def test_verification_is_idempotent() -> None:
    value = _golden_verification_inputs()[0]
    assert verify_patch(value) == verify_patch(value)
