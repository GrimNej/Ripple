-- Destructive only within RIPPLE.PREFLIGHT. Creates bounded capability probes.
-- Requires the already provisioned RIPPLE_ADMIN_ROLE and RIPPLE_WH.

USE SECONDARY ROLES NONE;
USE ROLE RIPPLE_ADMIN_ROLE;
USE WAREHOUSE RIPPLE_WH;
USE DATABASE RIPPLE;
USE SCHEMA PREFLIGHT;

SELECT CURRENT_VERSION() AS snowflake_version, CURRENT_REGION() AS snowflake_region;

CREATE OR REPLACE PROCEDURE RIPPLE.PREFLIGHT.TEST_PYTHON_311()
RETURNS VARIANT
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python==1.53.0')
HANDLER = 'run'
EXECUTE AS OWNER
AS
$$
import sys


def run(session):
    probe = session.sql("SELECT 1 AS VALUE").collect()[0]["VALUE"]
    return {
        "probe": probe,
        "runtime": f"{sys.version_info.major}.{sys.version_info.minor}",
        "status": "PYTHON_3_11_OK",
    }
$$;

CALL RIPPLE.PREFLIGHT.TEST_PYTHON_311();

SELECT AI_COMPLETE(
    model => 'mistral-large2',
    prompt => 'Return the successful status of the Ripple structured-output capability probe.',
    model_parameters => {
        'temperature': 0,
        'max_tokens': 64
    },
    response_format => {
        'type': 'json',
        'schema': {
            'type': 'object',
            'properties': {
                'capability': {'type': 'string'},
                'status': {'type': 'string', 'enum': ['PASS']}
            },
            'required': ['capability', 'status'],
            'additionalProperties': false
        }
    }
) AS ai_complete_structured_result;

SELECT AI_EMBED('e5-base-v2', 'Ripple bounded embedding capability probe') IS NOT NULL
    AS ai_embed_available;

CREATE OR REPLACE TABLE RIPPLE.PREFLIGHT.EVENT_SOURCE (
    event_id STRING NOT NULL,
    payload STRING NOT NULL,
    created_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE OR REPLACE TABLE RIPPLE.PREFLIGHT.TASK_RESULT (
    stage_name STRING NOT NULL,
    event_id STRING NOT NULL,
    processed_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE OR REPLACE STREAM RIPPLE.PREFLIGHT.EVENT_STREAM
    ON TABLE RIPPLE.PREFLIGHT.EVENT_SOURCE
    APPEND_ONLY = TRUE;

CREATE OR REPLACE TASK RIPPLE.PREFLIGHT.ROOT_TASK
    WAREHOUSE = RIPPLE_WH
    WHEN SYSTEM$STREAM_HAS_DATA('RIPPLE.PREFLIGHT.EVENT_STREAM')
AS
    INSERT INTO RIPPLE.PREFLIGHT.TASK_RESULT (stage_name, event_id)
    SELECT 'ROOT', event_id
    FROM RIPPLE.PREFLIGHT.EVENT_STREAM
    WHERE METADATA$ACTION = 'INSERT';

CREATE OR REPLACE TASK RIPPLE.PREFLIGHT.CHILD_TASK
    WAREHOUSE = RIPPLE_WH
    AFTER RIPPLE.PREFLIGHT.ROOT_TASK
AS
    INSERT INTO RIPPLE.PREFLIGHT.TASK_RESULT (stage_name, event_id)
    SELECT 'CHILD', event_id
    FROM RIPPLE.PREFLIGHT.TASK_RESULT
    WHERE stage_name = 'ROOT'
    QUALIFY ROW_NUMBER() OVER (ORDER BY processed_at DESC) = 1;

ALTER TASK RIPPLE.PREFLIGHT.CHILD_TASK RESUME;

INSERT INTO RIPPLE.PREFLIGHT.EVENT_SOURCE (event_id, payload)
VALUES ('preflight-task-graph', 'bounded deterministic capability probe');

EXECUTE TASK RIPPLE.PREFLIGHT.ROOT_TASK;

SELECT SYSTEM$WAIT(20) AS task_graph_wait;

ALTER TASK RIPPLE.PREFLIGHT.CHILD_TASK SUSPEND;

SELECT stage_name, event_id
FROM RIPPLE.PREFLIGHT.TASK_RESULT
ORDER BY processed_at;

SELECT
    name,
    state,
    scheduled_from,
    error_code,
    error_message
FROM TABLE(
    RIPPLE.INFORMATION_SCHEMA.TASK_HISTORY(
        SCHEDULED_TIME_RANGE_START => DATEADD('minute', -10, CURRENT_TIMESTAMP()),
        RESULT_LIMIT => 20
    )
)
WHERE database_name = 'RIPPLE'
  AND schema_name = 'PREFLIGHT'
  AND name IN ('ROOT_TASK', 'CHILD_TASK')
ORDER BY scheduled_time;

SHOW TASKS LIKE '%TASK' IN SCHEMA RIPPLE.PREFLIGHT;
SHOW STREAMS LIKE 'EVENT_STREAM' IN SCHEMA RIPPLE.PREFLIGHT;
