-- Roll back Phase 4 patch revision and audit-head state. Destructive: review first.
USE DATABASE RIPPLE;

DROP TABLE IF EXISTS OPS.AUDIT_HEAD;
DROP TABLE IF EXISTS APP.PATCH_REVISION;
