-- Add append-only patch revisions and a compare-and-set audit-chain head.
USE DATABASE RIPPLE;

CREATE TABLE IF NOT EXISTS APP.PATCH_REVISION (
    patch_id STRING NOT NULL,
    revision NUMBER NOT NULL CHECK (revision > 0),
    content STRING NOT NULL,
    content_sha256 STRING NOT NULL,
    created_by STRING NOT NULL,
    reason STRING,
    created_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

INSERT INTO APP.PATCH_REVISION (
    patch_id,
    revision,
    content,
    content_sha256,
    created_by,
    reason
)
SELECT
    proposal.patch_id,
    proposal.revision,
    proposal.proposed_content,
    proposal.proposed_content_sha256,
    'pipeline' AS created_by,
    'Initial deterministic proposal' AS reason
FROM APP.PATCH_PROPOSAL AS proposal
WHERE NOT EXISTS (
    SELECT 1
    FROM APP.PATCH_REVISION AS revision
    WHERE
        revision.patch_id = proposal.patch_id
        AND revision.revision = proposal.revision
);

CREATE TABLE IF NOT EXISTS OPS.AUDIT_HEAD (
    head_name STRING NOT NULL,
    event_sequence NUMBER NOT NULL CHECK (event_sequence >= 0),
    event_hash STRING,
    row_version NUMBER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

INSERT INTO OPS.AUDIT_HEAD (head_name, event_sequence, event_hash, row_version)
SELECT
    'GLOBAL' AS head_name,
    COALESCE((SELECT MAX(event_sequence) FROM OPS.AUDIT_EVENT), 0) AS event_sequence,
    (
        SELECT event_hash
        FROM OPS.AUDIT_EVENT
        ORDER BY event_sequence DESC
        LIMIT 1
    ) AS event_hash,
    0 AS row_version
WHERE NOT EXISTS (
    SELECT 1
    FROM OPS.AUDIT_HEAD
    WHERE head_name = 'GLOBAL'
);
