-- Register bounded pipeline procedures and the single authoritative task graph.
USE DATABASE RIPPLE;

CREATE OR REPLACE PROCEDURE API.START_ANALYSIS(
    old_snapshot_id STRING,
    new_snapshot_id STRING,
    idempotency_key STRING,
    correlation_id STRING
)
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python==1.53.0')
IMPORTS = (
    '@RIPPLE.RAW.CODE_STAGE/ripple_deterministic.py',
    '@RIPPLE.RAW.CODE_STAGE/diff_snapshots.py',
    '@RIPPLE.RAW.CODE_STAGE/pipeline_logic.py',
    '@RIPPLE.RAW.CODE_STAGE/run_pipeline.py'
)
HANDLER = 'run_pipeline.start_analysis'
EXECUTE AS OWNER;

CREATE OR REPLACE PROCEDURE API.RUN_PIPELINE(run_id STRING)
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python==1.53.0')
IMPORTS = (
    '@RIPPLE.RAW.CODE_STAGE/ripple_deterministic.py',
    '@RIPPLE.RAW.CODE_STAGE/diff_snapshots.py',
    '@RIPPLE.RAW.CODE_STAGE/pipeline_logic.py',
    '@RIPPLE.RAW.CODE_STAGE/run_pipeline.py'
)
HANDLER = 'run_pipeline.run_one'
EXECUTE AS OWNER;

CREATE OR REPLACE PROCEDURE PIPELINE.RUN_PENDING()
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python==1.53.0')
IMPORTS = (
    '@RIPPLE.RAW.CODE_STAGE/ripple_deterministic.py',
    '@RIPPLE.RAW.CODE_STAGE/diff_snapshots.py',
    '@RIPPLE.RAW.CODE_STAGE/pipeline_logic.py',
    '@RIPPLE.RAW.CODE_STAGE/run_pipeline.py'
)
HANDLER = 'run_pipeline.run_pending'
EXECUTE AS OWNER;

CREATE OR REPLACE TASK PIPELINE.ROOT_TASK
    WAREHOUSE = RIPPLE_WH
    SCHEDULE = '1 MINUTE'
    ALLOW_OVERLAPPING_EXECUTION = FALSE
WHEN SYSTEM$STREAM_HAS_DATA ('RIPPLE.PIPELINE.RUN_TRIGGER_STREAM')
AS CALL PIPELINE.RUN_PENDING();

CREATE OR REPLACE TASK PIPELINE.FINALIZE_TASK
    WAREHOUSE = RIPPLE_WH
    AFTER PIPELINE.ROOT_TASK
AS
    INSERT INTO OPS.TASK_PROOF (proof_id, run_id, run_status)
    SELECT
        SHA2('task-proof:' || run_id, 256) AS proof_id,
        run_id,
        status
    FROM PIPELINE.PIPELINE_RUN AS run
    WHERE
        status IN ('COMPLETED', 'FAILED')
        AND NOT EXISTS (
            SELECT 1
            FROM OPS.TASK_PROOF AS proof
            WHERE proof.run_id = run.run_id
        );

ALTER TASK PIPELINE.FINALIZE_TASK RESUME;
ALTER TASK PIPELINE.ROOT_TASK RESUME;
