-- Register fixed SQL/Scripting mutation boundaries for patch review and atomic apply.
USE DATABASE RIPPLE;

CREATE OR REPLACE PROCEDURE OPS.APPEND_AUDIT(
    entity_type STRING,
    entity_id STRING,
    event_type STRING,
    actor_name STRING,
    correlation_id STRING,
    payload_value VARIANT
)
RETURNS VARIANT
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
    previous_sequence NUMBER;
    previous_hash STRING;
    head_row_version NUMBER;
    next_sequence NUMBER;
    payload_hash STRING;
    next_event_hash STRING;
    next_event_id STRING;
    affected_rows NUMBER;
BEGIN
    payload_hash := SHA2(TO_JSON(payload_value), 256);
    FOR attempt IN 1 TO 5 DO
        SELECT event_sequence, event_hash, row_version
        INTO :previous_sequence, :previous_hash, :head_row_version
        FROM OPS.AUDIT_HEAD
        WHERE head_name = 'GLOBAL';

        next_sequence := previous_sequence + 1;
        next_event_hash := SHA2(
            CONCAT_WS(
                ':',
                next_sequence::STRING,
                entity_type,
                entity_id,
                event_type,
                actor_name,
                correlation_id,
                payload_hash,
                COALESCE(previous_hash, 'GENESIS')
            ),
            256
        );
        UPDATE OPS.AUDIT_HEAD
        SET
            event_sequence = :next_sequence,
            event_hash = :next_event_hash,
            row_version = row_version + 1,
            updated_at = CURRENT_TIMESTAMP()
        WHERE
            head_name = 'GLOBAL'
            AND event_sequence = :previous_sequence
            AND row_version = :head_row_version;
        affected_rows := SQLROWCOUNT;

        IF (affected_rows = 1) THEN
            next_event_id := 'audit-' || SUBSTR(
                SHA2(next_sequence::STRING || ':' || next_event_hash, 256),
                1,
                32
            );
            INSERT INTO OPS.AUDIT_EVENT (
                event_id,
                event_sequence,
                entity_type,
                entity_id,
                event_type,
                actor,
                correlation_id,
                payload_hash,
                previous_event_hash,
                event_hash
            )
            SELECT
                :next_event_id,
                :next_sequence,
                :entity_type,
                :entity_id,
                :event_type,
                :actor_name,
                :correlation_id,
                :payload_hash,
                :previous_hash,
                :next_event_hash;
            RETURN OBJECT_CONSTRUCT('ok', TRUE, 'eventId', next_event_id);
        END IF;
    END FOR;
    RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'AUDIT_APPEND_CONFLICT');
END;
$$;

CREATE OR REPLACE PROCEDURE API.REVISE_PATCH(
    patch_id STRING,
    expected_patch_revision NUMBER,
    expected_patch_row_version NUMBER,
    edited_content STRING,
    reason STRING,
    idempotency_key STRING,
    correlation_id STRING
)
RETURNS VARIANT
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
    request_hash STRING;
    edited_hash STRING;
    replay_count NUMBER DEFAULT 0;
    replay_hash STRING;
    replay_body VARIANT;
    patch_count NUMBER DEFAULT 0;
    current_status STRING;
    current_revision NUMBER;
    current_row_version NUMBER;
    affected_rows NUMBER;
    response_body VARIANT;
    audit_result VARIANT;
    transaction_started BOOLEAN DEFAULT FALSE;
BEGIN
    IF (
        NOT REGEXP_LIKE(patch_id, '^[A-Za-z0-9_-]{1,128}$')
        OR NOT REGEXP_LIKE(correlation_id, '^[A-Za-z0-9_-]{1,128}$')
    ) THEN
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'INVALID_IDENTIFIER');
    END IF;
    IF (NOT REGEXP_LIKE(idempotency_key, '^[A-Za-z0-9_-]{20,128}$')) THEN
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'INVALID_IDEMPOTENCY_KEY');
    END IF;
    IF (
        edited_content IS NULL
        OR OCTET_LENGTH(edited_content) = 0
        OR OCTET_LENGTH(edited_content) > 262144
    ) THEN
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'INVALID_APPROVED_CONTENT');
    END IF;
    IF (
        expected_patch_revision < 1
        OR expected_patch_row_version < 0
        OR COALESCE(LENGTH(reason), 0) > 500
    ) THEN
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'INVALID_PATCH_REVISION');
    END IF;

    edited_hash := SHA2(edited_content, 256);
    request_hash := SHA2(
        TO_JSON(
            ARRAY_CONSTRUCT(
                patch_id,
                expected_patch_revision,
                expected_patch_row_version,
                edited_content,
                reason
            )
        ),
        256
    );
    SELECT COUNT(*) INTO :replay_count
    FROM APP.MUTATION_REPLAY
    WHERE
        mutation_type = 'REVISE_PATCH'
        AND entity_id = :patch_id
        AND idempotency_key = :idempotency_key
        AND expires_at > CURRENT_TIMESTAMP();
    IF (replay_count > 0) THEN
        SELECT request_sha256, response_body
        INTO :replay_hash, :replay_body
        FROM APP.MUTATION_REPLAY
        WHERE
            mutation_type = 'REVISE_PATCH'
            AND entity_id = :patch_id
            AND idempotency_key = :idempotency_key
            AND expires_at > CURRENT_TIMESTAMP()
        ORDER BY created_at DESC
        LIMIT 1;
        IF (replay_hash <> request_hash) THEN
            RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'IDEMPOTENCY_CONFLICT');
        END IF;
        RETURN replay_body;
    END IF;

    BEGIN TRANSACTION;
    transaction_started := TRUE;
    UPDATE APP.PATCH_PROPOSAL
    SET
        proposed_content = :edited_content,
        proposed_content_sha256 = :edited_hash,
        revision = revision + 1,
        status = 'REVIEW_REQUIRED',
        row_version = row_version + 1,
        updated_at = CURRENT_TIMESTAMP()
    WHERE
        patch_id = :patch_id
        AND status = 'REVIEW_REQUIRED'
        AND revision = :expected_patch_revision
        AND row_version = :expected_patch_row_version;
    affected_rows := SQLROWCOUNT;
    IF (affected_rows <> 1) THEN
        ROLLBACK;
        transaction_started := FALSE;
        SELECT COUNT(*), MAX(status), MAX(revision), MAX(row_version)
        INTO :patch_count, :current_status, :current_revision, :current_row_version
        FROM APP.PATCH_PROPOSAL
        WHERE patch_id = :patch_id;
        IF (patch_count = 0) THEN
            RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'PATCH_NOT_FOUND');
        ELSEIF (current_status <> 'REVIEW_REQUIRED') THEN
            RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'PATCH_ALREADY_DECIDED');
        ELSE
            RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'STALE_PATCH_REVISION');
        END IF;
    END IF;

    INSERT INTO APP.PATCH_REVISION (
        patch_id,
        revision,
        content,
        content_sha256,
        created_by,
        reason
    )
    SELECT
        :patch_id,
        :expected_patch_revision + 1,
        :edited_content,
        :edited_hash,
        'operator',
        :reason;

    response_body := OBJECT_CONSTRUCT(
        'ok', TRUE,
        'code', 'PATCH_REVISED',
        'patchId', patch_id,
        'revision', expected_patch_revision + 1,
        'rowVersion', expected_patch_row_version + 1,
        'status', 'REVIEW_REQUIRED',
        'contentSha256', edited_hash
    );
    CALL OPS.APPEND_AUDIT(
        'PATCH_PROPOSAL',
        :patch_id,
        'PATCH_REVISED',
        'operator',
        :correlation_id,
        OBJECT_CONSTRUCT(
            'contentSha256', :edited_hash,
            'revision', :expected_patch_revision + 1
        )
    ) INTO :audit_result;
    IF (audit_result:ok::BOOLEAN <> TRUE) THEN
        ROLLBACK;
        transaction_started := FALSE;
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'AUDIT_APPEND_CONFLICT');
    END IF;
    INSERT INTO APP.MUTATION_REPLAY (
        mutation_type,
        entity_id,
        idempotency_key,
        request_sha256,
        response_status,
        response_body,
        expires_at
    )
    SELECT
        'REVISE_PATCH',
        :patch_id,
        :idempotency_key,
        :request_hash,
        200,
        :response_body,
        DATEADD('hour', 24, CURRENT_TIMESTAMP());
    COMMIT;
    transaction_started := FALSE;
    RETURN response_body;
EXCEPTION
    WHEN OTHER THEN
        IF (transaction_started) THEN
            ROLLBACK;
        END IF;
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'REVISE_PATCH_FAILED');
END;
$$;

CREATE OR REPLACE PROCEDURE API.REJECT_PATCH(
    patch_id STRING,
    expected_patch_revision NUMBER,
    expected_patch_row_version NUMBER,
    reason STRING,
    idempotency_key STRING,
    correlation_id STRING
)
RETURNS VARIANT
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
    request_hash STRING;
    replay_count NUMBER DEFAULT 0;
    replay_hash STRING;
    replay_body VARIANT;
    patch_count NUMBER DEFAULT 0;
    current_status STRING;
    affected_rows NUMBER;
    response_body VARIANT;
    audit_result VARIANT;
    transaction_started BOOLEAN DEFAULT FALSE;
BEGIN
    IF (
        NOT REGEXP_LIKE(patch_id, '^[A-Za-z0-9_-]{1,128}$')
        OR NOT REGEXP_LIKE(correlation_id, '^[A-Za-z0-9_-]{1,128}$')
    ) THEN
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'INVALID_IDENTIFIER');
    END IF;
    IF (NOT REGEXP_LIKE(idempotency_key, '^[A-Za-z0-9_-]{20,128}$')) THEN
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'INVALID_IDEMPOTENCY_KEY');
    END IF;
    IF (
        expected_patch_revision < 1
        OR expected_patch_row_version < 0
        OR COALESCE(LENGTH(reason), 0) > 500
    ) THEN
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'INVALID_PATCH_REVISION');
    END IF;

    request_hash := SHA2(
        TO_JSON(
            ARRAY_CONSTRUCT(
                patch_id,
                expected_patch_revision,
                expected_patch_row_version,
                reason
            )
        ),
        256
    );
    SELECT COUNT(*) INTO :replay_count
    FROM APP.MUTATION_REPLAY
    WHERE
        mutation_type = 'REJECT_PATCH'
        AND entity_id = :patch_id
        AND idempotency_key = :idempotency_key
        AND expires_at > CURRENT_TIMESTAMP();
    IF (replay_count > 0) THEN
        SELECT request_sha256, response_body
        INTO :replay_hash, :replay_body
        FROM APP.MUTATION_REPLAY
        WHERE
            mutation_type = 'REJECT_PATCH'
            AND entity_id = :patch_id
            AND idempotency_key = :idempotency_key
            AND expires_at > CURRENT_TIMESTAMP()
        ORDER BY created_at DESC
        LIMIT 1;
        IF (replay_hash <> request_hash) THEN
            RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'IDEMPOTENCY_CONFLICT');
        END IF;
        RETURN replay_body;
    END IF;

    BEGIN TRANSACTION;
    transaction_started := TRUE;
    UPDATE APP.PATCH_PROPOSAL
    SET
        status = 'REJECTED',
        row_version = row_version + 1,
        updated_at = CURRENT_TIMESTAMP()
    WHERE
        patch_id = :patch_id
        AND status = 'REVIEW_REQUIRED'
        AND revision = :expected_patch_revision
        AND row_version = :expected_patch_row_version;
    affected_rows := SQLROWCOUNT;
    IF (affected_rows <> 1) THEN
        ROLLBACK;
        transaction_started := FALSE;
        SELECT COUNT(*), MAX(status)
        INTO :patch_count, :current_status
        FROM APP.PATCH_PROPOSAL
        WHERE patch_id = :patch_id;
        IF (patch_count = 0) THEN
            RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'PATCH_NOT_FOUND');
        ELSEIF (current_status <> 'REVIEW_REQUIRED') THEN
            RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'PATCH_ALREADY_DECIDED');
        ELSE
            RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'STALE_PATCH_REVISION');
        END IF;
    END IF;

    INSERT INTO APP.REVIEW_DECISION (
        decision_id,
        patch_id,
        patch_revision,
        idempotency_key,
        decision,
        actor,
        reason
    )
    SELECT
        'decision-' || SUBSTR(SHA2(:patch_id || ':' || :idempotency_key, 256), 1, 32),
        :patch_id,
        :expected_patch_revision,
        :idempotency_key,
        'REJECT',
        'operator',
        :reason;
    response_body := OBJECT_CONSTRUCT(
        'ok', TRUE,
        'code', 'PATCH_REJECTED',
        'patchId', patch_id,
        'rowVersion', expected_patch_row_version + 1,
        'status', 'REJECTED'
    );
    CALL OPS.APPEND_AUDIT(
        'PATCH_PROPOSAL',
        :patch_id,
        'PATCH_REJECTED',
        'operator',
        :correlation_id,
        OBJECT_CONSTRUCT('revision', :expected_patch_revision)
    ) INTO :audit_result;
    IF (audit_result:ok::BOOLEAN <> TRUE) THEN
        ROLLBACK;
        transaction_started := FALSE;
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'AUDIT_APPEND_CONFLICT');
    END IF;
    INSERT INTO APP.MUTATION_REPLAY (
        mutation_type,
        entity_id,
        idempotency_key,
        request_sha256,
        response_status,
        response_body,
        expires_at
    )
    SELECT
        'REJECT_PATCH',
        :patch_id,
        :idempotency_key,
        :request_hash,
        200,
        :response_body,
        DATEADD('hour', 24, CURRENT_TIMESTAMP());
    COMMIT;
    transaction_started := FALSE;
    RETURN response_body;
EXCEPTION
    WHEN OTHER THEN
        IF (transaction_started) THEN
            ROLLBACK;
        END IF;
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'REJECT_PATCH_FAILED');
END;
$$;

CREATE OR REPLACE PROCEDURE API.APPLY_PATCH(
    patch_id STRING,
    expected_patch_revision NUMBER,
    expected_patch_row_version NUMBER,
    expected_asset_version_id STRING,
    approved_content STRING,
    reason STRING,
    idempotency_key STRING,
    correlation_id STRING
)
RETURNS VARIANT
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
    request_hash STRING;
    approved_hash STRING;
    replay_count NUMBER DEFAULT 0;
    replay_hash STRING;
    replay_body VARIANT;
    patch_count NUMBER DEFAULT 0;
    current_patch_status STRING;
    current_patch_revision NUMBER;
    current_patch_row_version NUMBER;
    current_target_version_id STRING;
    patch_asset_id STRING;
    current_asset_version_id STRING;
    current_asset_row_version NUMBER;
    result_asset_version_id STRING;
    affected_rows NUMBER;
    response_body VARIANT;
    audit_result VARIANT;
    transaction_started BOOLEAN DEFAULT FALSE;
BEGIN
    IF (
        NOT REGEXP_LIKE(patch_id, '^[A-Za-z0-9_-]{1,128}$')
        OR NOT REGEXP_LIKE(expected_asset_version_id, '^[A-Za-z0-9_-]{1,128}$')
        OR NOT REGEXP_LIKE(correlation_id, '^[A-Za-z0-9_-]{1,128}$')
    ) THEN
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'INVALID_IDENTIFIER');
    END IF;
    IF (NOT REGEXP_LIKE(idempotency_key, '^[A-Za-z0-9_-]{20,128}$')) THEN
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'INVALID_IDEMPOTENCY_KEY');
    END IF;
    IF (
        approved_content IS NULL
        OR OCTET_LENGTH(approved_content) = 0
        OR OCTET_LENGTH(approved_content) > 262144
    ) THEN
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'INVALID_APPROVED_CONTENT');
    END IF;
    IF (
        expected_patch_revision < 1
        OR expected_patch_row_version < 0
        OR COALESCE(LENGTH(reason), 0) > 500
    ) THEN
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'INVALID_PATCH_REVISION');
    END IF;

    approved_hash := SHA2(approved_content, 256);
    request_hash := SHA2(
        TO_JSON(
            ARRAY_CONSTRUCT(
                patch_id,
                expected_patch_revision,
                expected_patch_row_version,
                expected_asset_version_id,
                approved_content,
                reason
            )
        ),
        256
    );
    SELECT COUNT(*) INTO :replay_count
    FROM APP.MUTATION_REPLAY
    WHERE
        mutation_type = 'APPLY_PATCH'
        AND entity_id = :patch_id
        AND idempotency_key = :idempotency_key
        AND expires_at > CURRENT_TIMESTAMP();
    IF (replay_count > 0) THEN
        SELECT request_sha256, response_body
        INTO :replay_hash, :replay_body
        FROM APP.MUTATION_REPLAY
        WHERE
            mutation_type = 'APPLY_PATCH'
            AND entity_id = :patch_id
            AND idempotency_key = :idempotency_key
            AND expires_at > CURRENT_TIMESTAMP()
        ORDER BY created_at DESC
        LIMIT 1;
        IF (replay_hash <> request_hash) THEN
            RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'IDEMPOTENCY_CONFLICT');
        END IF;
        RETURN replay_body;
    END IF;

    BEGIN TRANSACTION;
    transaction_started := TRUE;
    UPDATE APP.PATCH_PROPOSAL
    SET
        status = 'APPLYING',
        row_version = row_version + 1,
        updated_at = CURRENT_TIMESTAMP()
    WHERE
        patch_id = :patch_id
        AND status = 'REVIEW_REQUIRED'
        AND revision = :expected_patch_revision
        AND row_version = :expected_patch_row_version
        AND target_asset_version_id = :expected_asset_version_id;
    affected_rows := SQLROWCOUNT;
    IF (affected_rows <> 1) THEN
        ROLLBACK;
        transaction_started := FALSE;
        SELECT COUNT(*) INTO :replay_count
        FROM APP.MUTATION_REPLAY
        WHERE
            mutation_type = 'APPLY_PATCH'
            AND entity_id = :patch_id
            AND idempotency_key = :idempotency_key
            AND expires_at > CURRENT_TIMESTAMP();
        IF (replay_count > 0) THEN
            SELECT request_sha256, response_body
            INTO :replay_hash, :replay_body
            FROM APP.MUTATION_REPLAY
            WHERE
                mutation_type = 'APPLY_PATCH'
                AND entity_id = :patch_id
                AND idempotency_key = :idempotency_key
                AND expires_at > CURRENT_TIMESTAMP()
            ORDER BY created_at DESC
            LIMIT 1;
            IF (replay_hash = request_hash) THEN
                RETURN replay_body;
            ELSE
                RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'IDEMPOTENCY_CONFLICT');
            END IF;
        END IF;
        SELECT
            COUNT(*),
            MAX(status),
            MAX(revision),
            MAX(row_version),
            MAX(target_asset_version_id)
        INTO
            :patch_count,
            :current_patch_status,
            :current_patch_revision,
            :current_patch_row_version,
            :current_target_version_id
        FROM APP.PATCH_PROPOSAL
        WHERE patch_id = :patch_id;
        IF (patch_count = 0) THEN
            RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'PATCH_NOT_FOUND');
        ELSEIF (current_patch_status <> 'REVIEW_REQUIRED') THEN
            RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'PATCH_ALREADY_DECIDED');
        ELSEIF (
            current_patch_revision <> expected_patch_revision
            OR current_patch_row_version <> expected_patch_row_version
        ) THEN
            RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'STALE_PATCH_REVISION');
        ELSEIF (current_target_version_id <> expected_asset_version_id) THEN
            RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'STALE_ASSET_VERSION');
        ELSE
            RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'PATCH_APPLY_CONFLICT');
        END IF;
    END IF;

    SELECT asset_id
    INTO :patch_asset_id
    FROM APP.PATCH_PROPOSAL
    WHERE patch_id = :patch_id AND status = 'APPLYING';
    SELECT current_version_id, row_version
    INTO :current_asset_version_id, :current_asset_row_version
    FROM CORE.KNOWLEDGE_ASSET
    WHERE asset_id = :patch_asset_id;
    IF (current_asset_version_id <> expected_asset_version_id) THEN
        ROLLBACK;
        transaction_started := FALSE;
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'STALE_ASSET_VERSION');
    END IF;

    result_asset_version_id := 'asset-version-' || SUBSTR(
        SHA2(
            TO_JSON(ARRAY_CONSTRUCT(patch_id, idempotency_key, approved_hash)),
            256
        ),
        1,
        32
    );
    INSERT INTO CORE.ASSET_VERSION (
        asset_version_id,
        asset_id,
        version_label,
        content,
        content_sha256,
        metadata_variant,
        supersedes_version_id,
        created_by
    )
    SELECT
        :result_asset_version_id,
        :patch_asset_id,
        'repair-r' || :expected_patch_revision,
        :approved_content,
        :approved_hash,
        OBJECT_CONSTRUCT(
            'patchId', :patch_id,
            'approvedContentSha256', :approved_hash
        ),
        :expected_asset_version_id,
        'operator';
    UPDATE CORE.KNOWLEDGE_ASSET
    SET
        current_version_id = :result_asset_version_id,
        row_version = row_version + 1,
        updated_at = CURRENT_TIMESTAMP()
    WHERE
        asset_id = :patch_asset_id
        AND current_version_id = :expected_asset_version_id
        AND row_version = :current_asset_row_version;
    affected_rows := SQLROWCOUNT;
    IF (affected_rows <> 1) THEN
        ROLLBACK;
        transaction_started := FALSE;
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'STALE_ASSET_VERSION');
    END IF;

    INSERT INTO APP.REVIEW_DECISION (
        decision_id,
        patch_id,
        patch_revision,
        idempotency_key,
        decision,
        approved_content_sha256,
        actor,
        reason,
        result_asset_version_id
    )
    SELECT
        'decision-' || SUBSTR(SHA2(:patch_id || ':' || :idempotency_key, 256), 1, 32),
        :patch_id,
        :expected_patch_revision,
        :idempotency_key,
        'APPLY',
        :approved_hash,
        'operator',
        :reason,
        :result_asset_version_id;
    UPDATE APP.PATCH_PROPOSAL
    SET
        status = 'APPLIED',
        applied_asset_version_id = :result_asset_version_id,
        row_version = row_version + 1,
        updated_at = CURRENT_TIMESTAMP()
    WHERE
        patch_id = :patch_id
        AND status = 'APPLYING'
        AND row_version = :expected_patch_row_version + 1;
    affected_rows := SQLROWCOUNT;
    IF (affected_rows <> 1) THEN
        ROLLBACK;
        transaction_started := FALSE;
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'PATCH_APPLY_CONFLICT');
    END IF;

    response_body := OBJECT_CONSTRUCT(
        'ok', TRUE,
        'code', 'PATCH_APPLIED',
        'patchId', patch_id,
        'assetVersionId', result_asset_version_id,
        'contentSha256', approved_hash,
        'rowVersion', expected_patch_row_version + 2,
        'status', 'APPLIED'
    );
    CALL OPS.APPEND_AUDIT(
        'PATCH_PROPOSAL',
        :patch_id,
        'PATCH_APPLIED',
        'operator',
        :correlation_id,
        OBJECT_CONSTRUCT(
            'approvedContentSha256', :approved_hash,
            'assetVersionId', :result_asset_version_id,
            'revision', :expected_patch_revision
        )
    ) INTO :audit_result;
    IF (audit_result:ok::BOOLEAN <> TRUE) THEN
        ROLLBACK;
        transaction_started := FALSE;
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'AUDIT_APPEND_CONFLICT');
    END IF;
    INSERT INTO APP.MUTATION_REPLAY (
        mutation_type,
        entity_id,
        idempotency_key,
        request_sha256,
        response_status,
        response_body,
        expires_at
    )
    SELECT
        'APPLY_PATCH',
        :patch_id,
        :idempotency_key,
        :request_hash,
        200,
        :response_body,
        DATEADD('hour', 24, CURRENT_TIMESTAMP());
    COMMIT;
    transaction_started := FALSE;
    RETURN response_body;
EXCEPTION
    WHEN OTHER THEN
        IF (transaction_started) THEN
            ROLLBACK;
        END IF;
        RETURN OBJECT_CONSTRUCT('ok', FALSE, 'code', 'APPLY_PATCH_FAILED');
END;
$$;

GRANT USAGE ON PROCEDURE API.REVISE_PATCH(
    STRING,
    NUMBER,
    NUMBER,
    STRING,
    STRING,
    STRING,
    STRING
) TO ROLE RIPPLE_APP_ROLE;
GRANT USAGE ON PROCEDURE API.REJECT_PATCH(
    STRING,
    NUMBER,
    NUMBER,
    STRING,
    STRING,
    STRING
) TO ROLE RIPPLE_APP_ROLE;
GRANT USAGE ON PROCEDURE API.APPLY_PATCH(
    STRING,
    NUMBER,
    NUMBER,
    STRING,
    STRING,
    STRING,
    STRING,
    STRING
) TO ROLE RIPPLE_APP_ROLE;
