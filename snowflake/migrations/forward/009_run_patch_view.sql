-- Expose the patches associated with one run without widening the application role.
USE DATABASE RIPPLE;

CREATE OR REPLACE SECURE VIEW API.RUN_PATCH_V AS
SELECT
    finding.run_id,
    patch.patch_id,
    patch.revision,
    patch.status,
    patch.row_version,
    patch.target_asset_version_id,
    patch.applied_asset_version_id,
    patch.created_at,
    patch.updated_at,
    finding.finding_id,
    finding.severity,
    atom.change_atom_id,
    atom.change_type,
    atom.old_claim,
    atom.new_claim,
    asset.asset_id,
    asset.title AS asset_title,
    asset.asset_type,
    asset.criticality
FROM APP.PATCH_PROPOSAL AS patch
INNER JOIN PIPELINE.IMPACT_FINDING AS finding ON patch.finding_id = finding.finding_id
INNER JOIN PIPELINE.CHANGE_ATOM AS atom ON finding.change_atom_id = atom.change_atom_id
INNER JOIN CORE.KNOWLEDGE_ASSET AS asset ON patch.asset_id = asset.asset_id;

GRANT SELECT ON VIEW API.RUN_PATCH_V TO ROLE RIPPLE_APP_ROLE;
