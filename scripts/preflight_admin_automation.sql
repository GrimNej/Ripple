-- One-time account-admin bootstrap for unattended, project-scoped Ripple migrations.
-- Invoke with Snowflake CLI STANDARD templating and a locally derived RSA public key.

USE SECONDARY ROLES NONE;
USE ROLE ACCOUNTADMIN;

CREATE USER IF NOT EXISTS RIPPLE_AUTOMATION_USER
    TYPE = SERVICE
    DEFAULT_ROLE = RIPPLE_ADMIN_ROLE
    DEFAULT_WAREHOUSE = RIPPLE_WH
    DEFAULT_NAMESPACE = 'RIPPLE.PREFLIGHT'
    RSA_PUBLIC_KEY = '<% admin_rsa_public_key %>'
    COMMENT = 'Key-pair-only automation identity restricted to Ripple project administration';

ALTER USER RIPPLE_AUTOMATION_USER SET
    TYPE = SERVICE
    DEFAULT_ROLE = RIPPLE_ADMIN_ROLE
    DEFAULT_WAREHOUSE = RIPPLE_WH
    DEFAULT_NAMESPACE = 'RIPPLE.PREFLIGHT'
    RSA_PUBLIC_KEY = '<% admin_rsa_public_key %>';

GRANT ROLE RIPPLE_ADMIN_ROLE TO USER RIPPLE_AUTOMATION_USER;

SHOW GRANTS TO USER RIPPLE_AUTOMATION_USER;
