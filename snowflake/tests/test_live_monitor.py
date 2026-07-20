from __future__ import annotations

import json
from hashlib import sha256

import pytest
from live_monitor import MonitorInputError, validate_payload


def _hash(value: str) -> str:
    return sha256(value.encode()).hexdigest()


def payload() -> dict[str, object]:
    source = "# Runtime\n\nPython 3.12 is required."
    asset = "# Install\n\nUse Python 3.10."
    return {
        "monitorId": "monitor-1234567890abcdef",
        "name": "Runtime policy",
        "repositoryOwner": "GrimNej",
        "repositoryName": "ripple-source-lab",
        "branch": "main",
        "sourcePath": "authoritative/runtime.md",
        "sourceContent": source,
        "sourceSha256": _hash(source),
        "commitSha": "a" * 40,
        "commitUrl": "https://github.com/GrimNej/ripple-source-lab/commit/" + "a" * 40,
        "committedAt": "2026-07-20T12:00:00Z",
        "notificationEmail": "operator@example.com",
        "checkIntervalMinutes": 720,
        "assets": [
            {
                "path": "knowledge/install.md",
                "title": "Install guide",
                "assetType": "INSTALL_GUIDE",
                "criticality": "HIGH",
                "content": asset,
                "contentSha256": _hash(asset),
            }
        ],
    }


def test_accepts_bounded_github_monitor_payload() -> None:
    validated = validate_payload(json.dumps(payload()), require_assets=True)

    assert validated["repositoryName"] == "ripple-source-lab"
    assert validated["assets"][0]["contentSha256"] == _hash("# Install\n\nUse Python 3.10.")


def test_preserves_exact_content_for_immutable_hashes() -> None:
    candidate = payload()
    source = "# Runtime\n\nPython 3.12 is required.\n"
    asset = "# Install\n\nUse Python 3.10.\n"
    candidate["sourceContent"] = source
    candidate["sourceSha256"] = _hash(source)
    assets = candidate["assets"]
    assert isinstance(assets, list)
    assert isinstance(assets[0], dict)
    assets[0]["content"] = asset
    assets[0]["contentSha256"] = _hash(asset)

    validated = validate_payload(json.dumps(candidate), require_assets=True)

    assert validated["sourceContent"] == source
    assert validated["assets"][0]["content"] == asset


@pytest.mark.parametrize(
    ("field", "value", "code"),
    [
        ("sourcePath", "../secret.md", "INVALID_SOURCE_LOCATION"),
        ("commitSha", "main", "INVALID_COMMIT"),
        ("checkIntervalMinutes", 1, "INVALID_CHECK_INTERVAL"),
        ("sourceSha256", "0" * 64, "CONTENT_HASH_MISMATCH"),
    ],
)
def test_rejects_untrusted_monitor_boundaries(field: str, value: object, code: str) -> None:
    candidate = payload()
    candidate[field] = value

    with pytest.raises(MonitorInputError, match=code):
        validate_payload(json.dumps(candidate), require_assets=True)


def test_requires_assets_only_when_connecting() -> None:
    candidate = payload()
    candidate["assets"] = []

    with pytest.raises(MonitorInputError, match="ASSETS_REQUIRED"):
        validate_payload(json.dumps(candidate), require_assets=True)
    assert validate_payload(json.dumps(candidate), require_assets=False)["assets"] == []
