-- Add operator-managed GitHub monitors, immutable live snapshots, and alert state.
USE DATABASE RIPPLE;

CREATE TABLE IF NOT EXISTS RAW.LIVE_SOURCE_CONTENT (
    snapshot_id STRING NOT NULL PRIMARY KEY NOT ENFORCED,
    raw_content STRING NOT NULL,
    raw_sha256 STRING NOT NULL,
    created_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS APP.SOURCE_MONITOR (
    monitor_id STRING NOT NULL PRIMARY KEY NOT ENFORCED,
    name STRING NOT NULL,
    provider STRING NOT NULL CHECK (provider IN ('GITHUB')),
    repository_owner STRING NOT NULL,
    repository_name STRING NOT NULL,
    branch_name STRING NOT NULL,
    source_path STRING NOT NULL,
    asset_manifest VARIANT NOT NULL,
    notification_email STRING,
    check_interval_minutes NUMBER NOT NULL CHECK (check_interval_minutes IN (720, 1440)),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    status STRING NOT NULL CHECK (
        status IN ('HEALTHY', 'CHECKING', 'CHANGE_DETECTED', 'ERROR', 'PAUSED')
    ),
    last_checked_at TIMESTAMP_TZ,
    last_commit_sha STRING,
    last_snapshot_id STRING,
    last_error_code STRING,
    row_version NUMBER NOT NULL DEFAULT 0,
    created_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP(),
    updated_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS OPS.MONITOR_CHECK (
    check_id STRING NOT NULL PRIMARY KEY NOT ENFORCED,
    monitor_id STRING NOT NULL,
    trigger_type STRING NOT NULL CHECK (trigger_type IN ('CONNECT', 'MANUAL', 'SCHEDULED')),
    status STRING NOT NULL CHECK (
        status IN ('BASELINE_CAPTURED', 'NO_CHANGE', 'CHANGE_DETECTED', 'FAILED')
    ),
    commit_sha STRING,
    previous_commit_sha STRING,
    snapshot_id STRING,
    previous_snapshot_id STRING,
    run_id STRING,
    failure_code STRING,
    notification_status STRING NOT NULL CHECK (
        notification_status IN ('NOT_REQUIRED', 'PENDING', 'SENT', 'FAILED')
    ),
    notification_attempt_count NUMBER NOT NULL DEFAULT 0,
    notification_attempted_at TIMESTAMP_TZ,
    checked_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE OR REPLACE PROCEDURE API.INGEST_MONITOR(
    payload_json STRING,
    trigger_type STRING,
    idempotency_key STRING,
    correlation_id STRING
)
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python==1.53.0')
IMPORTS = (
    '@RIPPLE.RAW.CODE_STAGE/audit_chain.py',
    '@RIPPLE.RAW.CODE_STAGE/ripple_deterministic.py',
    '@RIPPLE.RAW.CODE_STAGE/diff_snapshots.py',
    '@RIPPLE.RAW.CODE_STAGE/pipeline_logic.py',
    '@RIPPLE.RAW.CODE_STAGE/run_pipeline.py',
    '@RIPPLE.RAW.CODE_STAGE/live_monitor.py'
)
HANDLER = 'live_monitor.ingest'
EXECUTE AS OWNER;

CREATE OR REPLACE PROCEDURE API.SET_MONITOR_ENABLED(
    requested_monitor_id STRING,
    requested_enabled BOOLEAN,
    expected_row_version NUMBER
)
RETURNS VARIANT
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
    current_version NUMBER;
    affected_rows NUMBER;
BEGIN
    SELECT MAX(row_version) INTO :current_version
    FROM APP.SOURCE_MONITOR
    WHERE monitor_id = :requested_monitor_id;

    IF (current_version IS NULL) THEN
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'MONITOR_NOT_FOUND');
    END IF;
    IF (current_version <> expected_row_version) THEN
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'STALE_MONITOR');
    END IF;

    UPDATE APP.SOURCE_MONITOR
    SET
        enabled = :requested_enabled,
        status = IFF(:requested_enabled, 'HEALTHY', 'PAUSED'),
        row_version = row_version + 1,
        updated_at = CURRENT_TIMESTAMP()
    WHERE monitor_id = :requested_monitor_id AND row_version = :expected_row_version;

    affected_rows := SQLROWCOUNT;
    IF (affected_rows <> 1) THEN
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'STALE_MONITOR');
    END IF;

    RETURN OBJECT_CONSTRUCT(
        'ok', TRUE,
        'monitorId', requested_monitor_id,
        'status', IFF(requested_enabled, 'HEALTHY', 'PAUSED'),
        'rowVersion', expected_row_version + 1
    );
END;
$$;

CREATE OR REPLACE PROCEDURE API.MARK_MONITOR_NOTIFICATION(
    requested_check_id STRING,
    requested_status STRING
)
RETURNS VARIANT
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
BEGIN
    IF (requested_status NOT IN ('SENT', 'FAILED')) THEN
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'INVALID_NOTIFICATION_STATUS');
    END IF;

    UPDATE OPS.MONITOR_CHECK
    SET
        notification_status = :requested_status,
        notification_attempt_count = notification_attempt_count + 1,
        notification_attempted_at = CURRENT_TIMESTAMP()
    WHERE
        check_id = :requested_check_id
        AND notification_status IN ('PENDING', 'FAILED')
        AND notification_attempt_count < 3;

    RETURN OBJECT_CONSTRUCT('ok', TRUE, 'checkId', requested_check_id, 'status', requested_status);
END;
$$;

CREATE OR REPLACE SECURE VIEW API.MONITOR_V AS
SELECT
    monitor.monitor_id,
    monitor.name,
    monitor.provider,
    monitor.repository_owner,
    monitor.repository_name,
    monitor.branch_name,
    monitor.source_path,
    monitor.asset_manifest,
    monitor.notification_email,
    monitor.check_interval_minutes,
    monitor.enabled,
    monitor.status,
    monitor.last_checked_at,
    monitor.last_commit_sha,
    monitor.last_snapshot_id,
    monitor.last_error_code,
    monitor.row_version,
    monitor.created_at,
    monitor.updated_at,
    latest.check_id AS latest_check_id,
    latest.status AS latest_check_status,
    latest.run_id AS latest_run_id,
    latest.checked_at AS latest_check_at
FROM APP.SOURCE_MONITOR AS monitor
LEFT JOIN OPS.MONITOR_CHECK AS latest
    ON monitor.monitor_id = latest.monitor_id
QUALIFY ROW_NUMBER() OVER (
    PARTITION BY monitor.monitor_id
    ORDER BY latest.checked_at DESC NULLS LAST
) = 1;

CREATE OR REPLACE SECURE VIEW API.MONITOR_DUE_V AS
SELECT
    monitor_id,
    name,
    provider,
    repository_owner,
    repository_name,
    branch_name,
    source_path,
    asset_manifest,
    notification_email,
    check_interval_minutes,
    enabled,
    status,
    last_checked_at,
    last_commit_sha,
    last_snapshot_id,
    last_error_code,
    row_version,
    created_at,
    updated_at,
    latest_check_id,
    latest_check_status,
    latest_run_id,
    latest_check_at
FROM API.MONITOR_V
WHERE
    enabled = TRUE
    AND (
        last_checked_at IS NULL
        OR DATEADD('minute', check_interval_minutes, last_checked_at) <= CURRENT_TIMESTAMP()
    );

CREATE OR REPLACE SECURE VIEW API.MONITOR_NOTIFICATION_V AS
SELECT
    monitor.monitor_id,
    monitor.name AS monitor_name,
    monitor.notification_email,
    monitor.repository_owner,
    monitor.repository_name,
    monitor.source_path,
    check_record.check_id,
    check_record.commit_sha,
    check_record.previous_commit_sha,
    check_record.run_id,
    check_record.notification_status,
    check_record.notification_attempt_count,
    check_record.checked_at,
    snapshot.artifact_stage_path AS commit_url,
    summary.status AS run_status,
    summary.change_count,
    summary.confirmed_count,
    summary.uncertain_count,
    summary.patch_count
FROM OPS.MONITOR_CHECK AS check_record
INNER JOIN APP.SOURCE_MONITOR AS monitor ON check_record.monitor_id = monitor.monitor_id
LEFT JOIN CORE.SOURCE_SNAPSHOT AS snapshot ON check_record.snapshot_id = snapshot.snapshot_id
LEFT JOIN API.RUN_SUMMARY_V AS summary ON check_record.run_id = summary.run_id
WHERE
    check_record.notification_status IN ('PENDING', 'FAILED')
    AND check_record.notification_attempt_count < 3
    AND monitor.notification_email IS NOT NULL
    AND (check_record.run_id IS NULL OR summary.status IN ('COMPLETED', 'FAILED'));

CREATE OR REPLACE SECURE VIEW API.RUN_PROVENANCE_V AS
SELECT
    check_record.run_id,
    monitor.monitor_id,
    monitor.name AS monitor_name,
    monitor.repository_owner,
    monitor.repository_name,
    monitor.branch_name,
    monitor.source_path,
    check_record.commit_sha,
    check_record.previous_commit_sha,
    snapshot.artifact_stage_path AS commit_url,
    check_record.checked_at
FROM OPS.MONITOR_CHECK AS check_record
INNER JOIN APP.SOURCE_MONITOR AS monitor ON check_record.monitor_id = monitor.monitor_id
LEFT JOIN CORE.SOURCE_SNAPSHOT AS snapshot ON check_record.snapshot_id = snapshot.snapshot_id
WHERE check_record.run_id IS NOT NULL;

GRANT USAGE ON PROCEDURE API.INGEST_MONITOR(
    STRING,
    STRING,
    STRING,
    STRING
) TO ROLE RIPPLE_APP_ROLE;
GRANT USAGE ON PROCEDURE API.SET_MONITOR_ENABLED(
    STRING,
    BOOLEAN,
    NUMBER
) TO ROLE RIPPLE_APP_ROLE;
GRANT USAGE ON PROCEDURE API.MARK_MONITOR_NOTIFICATION(
    STRING,
    STRING
) TO ROLE RIPPLE_APP_ROLE;
GRANT SELECT ON VIEW API.MONITOR_V TO ROLE RIPPLE_APP_ROLE;
GRANT SELECT ON VIEW API.MONITOR_DUE_V TO ROLE RIPPLE_APP_ROLE;
GRANT SELECT ON VIEW API.MONITOR_NOTIFICATION_V TO ROLE RIPPLE_APP_ROLE;
GRANT SELECT ON VIEW API.RUN_PROVENANCE_V TO ROLE RIPPLE_APP_ROLE;
