USE ROLE RIPPLE_ADMIN_ROLE;
USE WAREHOUSE RIPPLE_WH;
USE DATABASE RIPPLE;

CREATE OR REPLACE SECURE VIEW API.PATCH_DETAIL_V AS
SELECT
    patch.patch_id,
    patch.revision,
    patch.status,
    patch.row_version,
    patch.proposed_content,
    patch.proposed_content_sha256,
    patch.target_asset_version_id,
    patch.applied_asset_version_id,
    patch.created_at,
    patch.updated_at,
    finding.run_id,
    finding.finding_id,
    finding.severity,
    finding.source_evidence,
    finding.asset_evidence,
    atom.change_atom_id,
    atom.change_type,
    atom.old_claim,
    atom.new_claim,
    asset.asset_id,
    asset.title AS asset_title,
    asset.asset_type,
    asset.criticality,
    asset.current_version_id,
    asset.row_version AS asset_row_version,
    original.content AS original_content,
    original.content_sha256 AS original_content_sha256,
    current_version.content AS current_content,
    current_version.content_sha256 AS current_content_sha256,
    verification.verification_id,
    verification.status AS verification_status,
    verification.checks AS verification_checks,
    verification.ai_advisory,
    verification.created_at AS verified_at
FROM APP.PATCH_PROPOSAL AS patch
INNER JOIN PIPELINE.IMPACT_FINDING AS finding ON patch.finding_id = finding.finding_id
INNER JOIN PIPELINE.CHANGE_ATOM AS atom ON finding.change_atom_id = atom.change_atom_id
INNER JOIN CORE.KNOWLEDGE_ASSET AS asset ON patch.asset_id = asset.asset_id
INNER JOIN CORE.ASSET_VERSION AS original
    ON patch.target_asset_version_id = original.asset_version_id
INNER JOIN CORE.ASSET_VERSION AS current_version
    ON asset.current_version_id = current_version.asset_version_id
LEFT JOIN APP.VERIFICATION_RESULT AS verification
    ON verification.verification_id = (
        SELECT candidate.verification_id
        FROM APP.VERIFICATION_RESULT AS candidate
        WHERE candidate.patch_id = patch.patch_id
        ORDER BY candidate.created_at DESC
        LIMIT 1
    );

GRANT SELECT ON VIEW API.PATCH_DETAIL_V TO ROLE RIPPLE_APP_ROLE;
