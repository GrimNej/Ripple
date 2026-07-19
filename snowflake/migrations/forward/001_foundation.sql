-- Ripple deterministic data foundation.
USE DATABASE RIPPLE;

CREATE SCHEMA IF NOT EXISTS RAW;
CREATE SCHEMA IF NOT EXISTS CORE;
CREATE SCHEMA IF NOT EXISTS PIPELINE;
CREATE SCHEMA IF NOT EXISTS APP;
CREATE SCHEMA IF NOT EXISTS OPS;
CREATE SCHEMA IF NOT EXISTS EVAL;
CREATE SCHEMA IF NOT EXISTS API;

CREATE STAGE IF NOT EXISTS RAW.FIXTURE_STAGE
    ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE')
    DIRECTORY = (ENABLE = TRUE);

CREATE STAGE IF NOT EXISTS RAW.CODE_STAGE
    ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE')
    DIRECTORY = (ENABLE = TRUE);

CREATE TABLE IF NOT EXISTS RAW.FIXTURE_MANIFEST (
    scenario_id STRING NOT NULL,
    manifest_sha256 STRING NOT NULL,
    manifest_variant VARIANT NOT NULL,
    loaded_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS CORE.SOURCE (
    source_id STRING NOT NULL PRIMARY KEY NOT ENFORCED,
    name STRING NOT NULL,
    canonical_url STRING NOT NULL,
    source_kind STRING NOT NULL CHECK (
        source_kind IN ('AUTHORITATIVE_DOC', 'RELEASE_NOTES', 'API_REFERENCE')
    ),
    active BOOLEAN NOT NULL,
    created_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP(),
    row_version NUMBER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS CORE.SOURCE_SNAPSHOT (
    snapshot_id STRING NOT NULL PRIMARY KEY NOT ENFORCED,
    source_id STRING NOT NULL,
    version_label STRING NOT NULL,
    artifact_stage_path STRING NOT NULL,
    raw_sha256 STRING NOT NULL,
    normalized_sha256 STRING,
    content_type STRING NOT NULL,
    byte_size NUMBER NOT NULL CHECK (byte_size BETWEEN 0 AND 1048576),
    normalizer_version STRING,
    retrieved_at TIMESTAMP_TZ NOT NULL,
    fixture_disclosure STRING NOT NULL,
    licence_basis STRING NOT NULL,
    status STRING NOT NULL CHECK (status IN ('RECEIVED', 'FINALIZED', 'FAILED')),
    created_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS CORE.SOURCE_SECTION (
    section_id STRING NOT NULL PRIMARY KEY NOT ENFORCED,
    snapshot_id STRING NOT NULL,
    section_key STRING NOT NULL,
    ordinal NUMBER NOT NULL CHECK (ordinal BETWEEN 0 AND 199),
    heading STRING NOT NULL,
    normalized_text STRING NOT NULL,
    start_offset NUMBER NOT NULL CHECK (start_offset >= 0),
    end_offset NUMBER NOT NULL,
    text_sha256 STRING NOT NULL,
    normalizer_version STRING NOT NULL,
    created_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS CORE.KNOWLEDGE_ASSET (
    asset_id STRING NOT NULL PRIMARY KEY NOT ENFORCED,
    stable_key STRING NOT NULL,
    asset_type STRING NOT NULL CHECK (
        asset_type IN ('README', 'INSTALL_GUIDE', 'SUPPORT_MACRO', 'TROUBLESHOOTING', 'WORKFLOW')
    ),
    title STRING NOT NULL,
    criticality STRING NOT NULL CHECK (criticality IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    current_version_id STRING,
    row_version NUMBER NOT NULL DEFAULT 0,
    created_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS CORE.ASSET_VERSION (
    asset_version_id STRING NOT NULL PRIMARY KEY NOT ENFORCED,
    asset_id STRING NOT NULL,
    version_label STRING NOT NULL,
    content STRING NOT NULL,
    content_sha256 STRING NOT NULL,
    metadata_variant VARIANT,
    supersedes_version_id STRING,
    created_by STRING NOT NULL,
    created_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS CORE.EXPLICIT_DEPENDENCY (
    dependency_id STRING NOT NULL PRIMARY KEY NOT ENFORCED,
    source_section_key STRING NOT NULL,
    asset_id STRING NOT NULL,
    dependency_kind STRING NOT NULL,
    basis STRING NOT NULL,
    created_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS PIPELINE.PIPELINE_RUN (
    run_id STRING NOT NULL PRIMARY KEY NOT ENFORCED,
    entity_type STRING NOT NULL,
    entity_id STRING NOT NULL,
    status STRING NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
    current_stage STRING,
    correlation_id STRING NOT NULL,
    created_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP(),
    completed_at TIMESTAMP_TZ,
    failure_code STRING,
    failure_stage STRING,
    row_version NUMBER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS PIPELINE.PIPELINE_STAGE (
    stage_run_id STRING NOT NULL PRIMARY KEY NOT ENFORCED,
    run_id STRING NOT NULL,
    stage_name STRING NOT NULL,
    input_hash STRING NOT NULL,
    stage_key STRING NOT NULL,
    status STRING NOT NULL CHECK (
        status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED')
    ),
    attempt_count NUMBER NOT NULL DEFAULT 0,
    started_at TIMESTAMP_TZ,
    completed_at TIMESTAMP_TZ,
    output_reference VARIANT,
    failure_code STRING,
    failure_detail STRING
);

CREATE TABLE IF NOT EXISTS PIPELINE.SECTION_DIFF (
    section_diff_id STRING NOT NULL PRIMARY KEY NOT ENFORCED,
    run_id STRING NOT NULL,
    old_snapshot_id STRING NOT NULL,
    new_snapshot_id STRING NOT NULL,
    section_key STRING NOT NULL,
    status STRING NOT NULL CHECK (status IN ('ADDED', 'REMOVED', 'CHANGED', 'UNCHANGED')),
    old_section_id STRING,
    new_section_id STRING,
    old_text_sha256 STRING,
    new_text_sha256 STRING,
    created_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS PIPELINE.CHANGE_ATOM (
    change_atom_id STRING NOT NULL PRIMARY KEY NOT ENFORCED,
    run_id STRING NOT NULL,
    change_type STRING NOT NULL CHECK (
        change_type IN ('VERSION_REQUIREMENT', 'ENDPOINT_REPLACEMENT', 'NUMERIC_LIMIT')
    ),
    old_claim STRING NOT NULL,
    new_claim STRING NOT NULL,
    old_evidence VARIANT NOT NULL,
    new_evidence VARIANT NOT NULL,
    model_score FLOAT,
    validation_status STRING NOT NULL CHECK (
        validation_status IN ('VALID', 'INVALID', 'UNCERTAIN')
    ),
    created_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS PIPELINE.IMPACT_FINDING (
    finding_id STRING NOT NULL PRIMARY KEY NOT ENFORCED,
    run_id STRING NOT NULL,
    change_atom_id STRING NOT NULL,
    asset_id STRING NOT NULL,
    asset_version_id STRING NOT NULL,
    status STRING NOT NULL CHECK (status IN ('CANDIDATE', 'CONFIRMED', 'REJECTED', 'UNCERTAIN')),
    impact_type STRING NOT NULL,
    source_evidence VARIANT,
    asset_evidence VARIANT,
    model_score FLOAT,
    severity STRING NOT NULL,
    severity_score FLOAT NOT NULL,
    created_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS PIPELINE.AI_RUN (
    ai_run_id STRING NOT NULL PRIMARY KEY NOT ENFORCED,
    run_id STRING NOT NULL,
    stage_name STRING NOT NULL,
    model STRING NOT NULL,
    prompt_version STRING NOT NULL,
    schema_version STRING NOT NULL,
    input_sha256 STRING NOT NULL,
    status STRING NOT NULL CHECK (
        status IN (
            'SUCCEEDED',
            'SCHEMA_FAILED',
            'EVIDENCE_FAILED',
            'MODEL_FAILED',
            'BUDGET_REJECTED'
        )
    ),
    input_tokens NUMBER,
    output_tokens NUMBER,
    estimated_ai_credits FLOAT,
    created_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS APP.PATCH_PROPOSAL (
    patch_id STRING NOT NULL PRIMARY KEY NOT ENFORCED,
    finding_id STRING NOT NULL,
    asset_id STRING NOT NULL,
    target_asset_version_id STRING NOT NULL,
    revision NUMBER NOT NULL,
    status STRING NOT NULL CHECK (
        status IN (
            'DRAFT',
            'REVIEW_REQUIRED',
            'APPLYING',
            'APPLIED',
            'REJECTED',
            'VERIFIED',
            'VERIFICATION_FAILED',
            'HUMAN_VERIFICATION_REQUIRED'
        )
    ),
    proposed_content STRING NOT NULL,
    proposed_content_sha256 STRING NOT NULL,
    applied_asset_version_id STRING,
    row_version NUMBER NOT NULL DEFAULT 0,
    created_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS APP.REVIEW_DECISION (
    decision_id STRING NOT NULL PRIMARY KEY NOT ENFORCED,
    patch_id STRING NOT NULL,
    patch_revision NUMBER NOT NULL,
    idempotency_key STRING NOT NULL,
    decision STRING NOT NULL CHECK (decision IN ('APPLY', 'REJECT')),
    approved_content_sha256 STRING,
    actor STRING NOT NULL,
    reason STRING,
    result_asset_version_id STRING,
    created_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS APP.MUTATION_REPLAY (
    mutation_type STRING NOT NULL,
    entity_id STRING NOT NULL,
    idempotency_key STRING NOT NULL,
    request_sha256 STRING NOT NULL,
    response_status NUMBER NOT NULL,
    response_body VARIANT NOT NULL,
    created_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP(),
    expires_at TIMESTAMP_TZ NOT NULL
);

CREATE TABLE IF NOT EXISTS APP.VERIFICATION_RESULT (
    verification_id STRING NOT NULL PRIMARY KEY NOT ENFORCED,
    patch_id STRING NOT NULL,
    asset_version_id STRING NOT NULL,
    change_type STRING NOT NULL,
    status STRING NOT NULL CHECK (status IN ('VERIFIED', 'FAILED', 'HUMAN_REQUIRED')),
    checks VARIANT NOT NULL,
    ai_advisory VARIANT,
    created_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS OPS.AUDIT_EVENT (
    event_id STRING NOT NULL PRIMARY KEY NOT ENFORCED,
    event_sequence NUMBER NOT NULL,
    entity_type STRING NOT NULL,
    entity_id STRING NOT NULL,
    event_type STRING NOT NULL,
    actor STRING NOT NULL,
    correlation_id STRING NOT NULL,
    payload_hash STRING NOT NULL,
    previous_event_hash STRING,
    event_hash STRING NOT NULL,
    created_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS OPS.SCHEMA_MIGRATION (
    migration_order NUMBER NOT NULL,
    filename STRING NOT NULL,
    sha256 STRING NOT NULL,
    applied_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP(),
    applied_commit STRING NOT NULL
);

CREATE TABLE IF NOT EXISTS OPS.CAPABILITY_RECORD (
    capability_id STRING NOT NULL,
    capability_name STRING NOT NULL,
    status STRING NOT NULL,
    sanitized_evidence VARIANT NOT NULL,
    checked_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS OPS.COST_EVENT (
    cost_event_id STRING NOT NULL,
    run_id STRING,
    cost_kind STRING NOT NULL,
    credits FLOAT NOT NULL,
    source_reference STRING,
    recorded_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS EVAL.BENCHMARK_LABEL (
    scenario_id STRING NOT NULL,
    asset_id STRING NOT NULL,
    expected_status STRING NOT NULL CHECK (
        expected_status IN ('CONFIRMED', 'REJECTED', 'UNCERTAIN')
    ),
    expected_change_type STRING,
    authored_before_model_execution BOOLEAN NOT NULL,
    created_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS EVAL.BENCHMARK_METRIC (
    metric_id STRING NOT NULL,
    run_id STRING NOT NULL,
    metric_name STRING NOT NULL,
    metric_value FLOAT NOT NULL,
    measured_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);
