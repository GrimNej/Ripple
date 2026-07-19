-- Expose only sanitized, fixed read models to the narrow application role.
USE DATABASE RIPPLE;

CREATE OR REPLACE SECURE VIEW API.RUN_SUMMARY_V AS
SELECT
    run.run_id,
    run.status,
    run.current_stage,
    run.correlation_id,
    run.created_at,
    run.completed_at,
    run.failure_code,
    run.failure_stage,
    run.row_version,
    (
        SELECT COUNT(*)
        FROM PIPELINE.CHANGE_ATOM AS atom
        WHERE atom.run_id = run.run_id AND atom.validation_status = 'VALID'
    ) AS change_count,
    (
        SELECT COUNT_IF(finding.status = 'CONFIRMED')
        FROM PIPELINE.IMPACT_FINDING AS finding
        WHERE finding.run_id = run.run_id
    ) AS confirmed_count,
    (
        SELECT COUNT_IF(finding.status = 'REJECTED')
        FROM PIPELINE.IMPACT_FINDING AS finding
        WHERE finding.run_id = run.run_id
    ) AS rejected_count,
    (
        SELECT COUNT_IF(finding.status = 'UNCERTAIN')
        FROM PIPELINE.IMPACT_FINDING AS finding
        WHERE finding.run_id = run.run_id
    ) AS uncertain_count,
    (
        SELECT COUNT(*)
        FROM APP.PATCH_PROPOSAL AS patch
        INNER JOIN PIPELINE.IMPACT_FINDING AS finding ON patch.finding_id = finding.finding_id
        WHERE finding.run_id = run.run_id
    ) AS patch_count
FROM PIPELINE.PIPELINE_RUN AS run;

CREATE OR REPLACE SECURE VIEW API.DASHBOARD_V AS
SELECT
    summary.run_id,
    summary.status,
    summary.current_stage,
    summary.correlation_id,
    summary.created_at,
    summary.completed_at,
    summary.failure_code,
    summary.failure_stage,
    summary.row_version,
    summary.change_count,
    summary.confirmed_count,
    summary.rejected_count,
    summary.uncertain_count,
    summary.patch_count,
    (
        SELECT COUNT(*)
        FROM CORE.SOURCE AS source
        WHERE source.active = TRUE
    ) AS source_count,
    (SELECT COUNT(*) FROM CORE.KNOWLEDGE_ASSET) AS asset_count,
    (
        SELECT COUNT_IF(patch.status = 'REVIEW_REQUIRED')
        FROM APP.PATCH_PROPOSAL AS patch
    ) AS review_required_count,
    (
        SELECT COUNT_IF(patch.status = 'VERIFIED')
        FROM APP.PATCH_PROPOSAL AS patch
    ) AS verified_patch_count
FROM API.RUN_SUMMARY_V AS summary
QUALIFY ROW_NUMBER() OVER (ORDER BY summary.created_at DESC) = 1;

CREATE OR REPLACE SECURE VIEW API.RUN_STAGE_V AS
SELECT
    run.run_id,
    run.status AS run_status,
    run.current_stage,
    run.failure_code AS run_failure_code,
    stage.stage_run_id,
    stage.stage_name,
    stage.status AS stage_status,
    stage.attempt_count,
    stage.started_at,
    stage.completed_at,
    stage.failure_code AS stage_failure_code,
    stage.failure_detail
FROM PIPELINE.PIPELINE_RUN AS run
LEFT JOIN PIPELINE.PIPELINE_STAGE AS stage ON run.run_id = stage.run_id;

CREATE OR REPLACE SECURE VIEW API.RUN_GRAPH_V AS
SELECT
    finding.run_id,
    finding.finding_id,
    finding.status AS finding_status,
    finding.impact_type,
    finding.severity,
    finding.severity_score,
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
    asset.current_version_id
FROM PIPELINE.IMPACT_FINDING AS finding
INNER JOIN PIPELINE.CHANGE_ATOM AS atom ON finding.change_atom_id = atom.change_atom_id
INNER JOIN CORE.KNOWLEDGE_ASSET AS asset ON finding.asset_id = asset.asset_id;

CREATE OR REPLACE SECURE VIEW API.RUN_FINDING_V AS
SELECT
    finding.run_id,
    finding.finding_id,
    finding.status,
    finding.impact_type,
    finding.severity,
    finding.severity_score,
    finding.model_score,
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
    finding.asset_version_id,
    SUBSTR(
        section.normalized_text,
        finding.source_evidence:startOffset::NUMBER + 1,
        finding.source_evidence:endOffset::NUMBER - finding.source_evidence:startOffset::NUMBER
    ) AS source_excerpt,
    IFF(
        finding.asset_evidence IS NULL,
        NULL,
        SUBSTR(
            version.content,
            finding.asset_evidence:startOffset::NUMBER + 1,
            finding.asset_evidence:endOffset::NUMBER
            - finding.asset_evidence:startOffset::NUMBER
        )
    ) AS asset_excerpt
FROM PIPELINE.IMPACT_FINDING AS finding
INNER JOIN PIPELINE.CHANGE_ATOM AS atom ON finding.change_atom_id = atom.change_atom_id
INNER JOIN CORE.KNOWLEDGE_ASSET AS asset ON finding.asset_id = asset.asset_id
INNER JOIN CORE.ASSET_VERSION AS version ON finding.asset_version_id = version.asset_version_id
INNER JOIN CORE.SOURCE_SECTION AS section
    ON finding.source_evidence:sectionId::STRING = section.section_id;

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

CREATE OR REPLACE SECURE VIEW API.PROOF_V AS
SELECT
    (SELECT COUNT(*) FROM OPS.SCHEMA_MIGRATION) AS applied_migration_count,
    (SELECT COUNT(*) FROM OPS.TASK_PROOF) AS task_proof_count,
    (SELECT COUNT(*) FROM OPS.AUDIT_EVENT) AS audit_event_count,
    (
        SELECT COUNT(*)
        FROM OPS.AUDIT_HEAD AS head
        WHERE
            head.head_name = 'GLOBAL'
            AND head.event_sequence = (
                SELECT MAX(audit.event_sequence)
                FROM OPS.AUDIT_EVENT AS audit
            )
            AND head.event_hash = (
                SELECT audit.event_hash
                FROM OPS.AUDIT_EVENT AS audit
                ORDER BY audit.event_sequence DESC
                LIMIT 1
            )
    ) AS audit_head_valid,
    (
        SELECT COUNT_IF(patch.status = 'VERIFIED')
        FROM APP.PATCH_PROPOSAL AS patch
    ) AS verified_patch_count,
    (
        SELECT COUNT_IF(label.authored_before_model_execution = TRUE)
        FROM EVAL.BENCHMARK_LABEL AS label
    ) AS frozen_label_count,
    (
        SELECT COUNT_IF(ai_run.status = 'SUCCEEDED')
        FROM PIPELINE.AI_RUN AS ai_run
    ) AS successful_ai_run_count,
    (
        SELECT COUNT_IF(admission.status = 'ADMITTED')
        FROM OPS.AI_DAILY_ADMISSION AS admission
        WHERE admission.usage_date = CURRENT_DATE()
    ) AS admitted_ai_call_count;

GRANT SELECT ON VIEW API.RUN_SUMMARY_V TO ROLE RIPPLE_APP_ROLE;
GRANT SELECT ON VIEW API.DASHBOARD_V TO ROLE RIPPLE_APP_ROLE;
GRANT SELECT ON VIEW API.RUN_STAGE_V TO ROLE RIPPLE_APP_ROLE;
GRANT SELECT ON VIEW API.RUN_GRAPH_V TO ROLE RIPPLE_APP_ROLE;
GRANT SELECT ON VIEW API.RUN_FINDING_V TO ROLE RIPPLE_APP_ROLE;
GRANT SELECT ON VIEW API.PATCH_DETAIL_V TO ROLE RIPPLE_APP_ROLE;
GRANT SELECT ON VIEW API.PROOF_V TO ROLE RIPPLE_APP_ROLE;
