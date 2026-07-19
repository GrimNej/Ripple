-- Register deterministic verification and rebind pipeline procedures to the CAS audit chain.
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
    '@RIPPLE.RAW.CODE_STAGE/audit_chain.py',
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
    '@RIPPLE.RAW.CODE_STAGE/audit_chain.py',
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
    '@RIPPLE.RAW.CODE_STAGE/audit_chain.py',
    '@RIPPLE.RAW.CODE_STAGE/ripple_deterministic.py',
    '@RIPPLE.RAW.CODE_STAGE/diff_snapshots.py',
    '@RIPPLE.RAW.CODE_STAGE/pipeline_logic.py',
    '@RIPPLE.RAW.CODE_STAGE/run_pipeline.py'
)
HANDLER = 'run_pipeline.run_pending'
EXECUTE AS OWNER;

CREATE OR REPLACE PROCEDURE API.VERIFY_PATCH(
    patch_id STRING,
    expected_patch_row_version NUMBER,
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
    '@RIPPLE.RAW.CODE_STAGE/pipeline_logic.py',
    '@RIPPLE.RAW.CODE_STAGE/patch_logic.py',
    '@RIPPLE.RAW.CODE_STAGE/verify_patch.py'
)
HANDLER = 'verify_patch.run'
EXECUTE AS OWNER;

GRANT USAGE ON PROCEDURE API.START_ANALYSIS(
    STRING,
    STRING,
    STRING,
    STRING
) TO ROLE RIPPLE_APP_ROLE;
GRANT USAGE ON PROCEDURE API.RUN_PIPELINE(STRING) TO ROLE RIPPLE_APP_ROLE;
GRANT USAGE ON PROCEDURE API.VERIFY_PATCH(
    STRING,
    NUMBER,
    STRING,
    STRING
) TO ROLE RIPPLE_APP_ROLE;
