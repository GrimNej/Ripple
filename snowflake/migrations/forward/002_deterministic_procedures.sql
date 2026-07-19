-- Register owner-executed deterministic procedures from immutable staged Python files.
USE DATABASE RIPPLE;

CREATE OR REPLACE PROCEDURE CORE.FINALIZE_SNAPSHOT(
    snapshot_id STRING,
    scoped_file_url STRING
)
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python==1.53.0')
IMPORTS = (
    '@RIPPLE.RAW.CODE_STAGE/ripple_deterministic.py',
    '@RIPPLE.RAW.CODE_STAGE/ingest_snapshot.py'
)
HANDLER = 'ingest_snapshot.run'
EXECUTE AS OWNER;

CREATE OR REPLACE PROCEDURE CORE.DIFF_SNAPSHOTS(
    run_id STRING,
    old_snapshot_id STRING,
    new_snapshot_id STRING
)
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python==1.53.0')
IMPORTS = (
    '@RIPPLE.RAW.CODE_STAGE/ripple_deterministic.py',
    '@RIPPLE.RAW.CODE_STAGE/diff_snapshots.py'
)
HANDLER = 'diff_snapshots.run'
EXECUTE AS OWNER;
