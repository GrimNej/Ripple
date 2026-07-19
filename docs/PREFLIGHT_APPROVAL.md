# Capability preflight approval request

**Status:** Awaiting owner approval. Nothing in this document has been executed.

## Proposed footprint

| Object | Purpose | Cost/security effect |
|---|---|---|
| `RIPPLE_ADMIN_ROLE` | Own project objects and run preflight probes | Custom role only; never used by the app |
| `RIPPLE_APP_ROLE` | Execute fixed API procedures/read approved views | No create, raw stage, table mutation, or audit mutation access |
| `RIPPLE_APP_USER` | SQL API service identity | `TYPE=SERVICE`, key-pair authentication, no password |
| `RIPPLE_WH` | Preflight/build/demo compute | X-Small, 60-second suspend, auto-resume, initially suspended |
| `RIPPLE_BUILD_MONITOR` | Warehouse guardrail | 5 warehouse credits; notify at 80%, suspend immediately at 100% |
| `RIPPLE` database | Project namespace | Trial-account storage/metadata only |
| `RIPPLE.PREFLIGHT` schema | Disposable capability objects | Minimal tables/procedures/tasks for the four-hour probe |
| `RIPPLE.API` schema and `HEALTH()` | Fixed SQL API authentication probe | App role receives only usage/execute privileges |

The admin role receives `SNOWFLAKE.CORTEX_USER` and account-level `EXECUTE TASK` solely because the preflight must test `AI_COMPLETE` and a task graph. No cross-region inference setting is changed. No stage, task graph, production table, Cloudflare secret, or deployment is created by the provisioning script.

## Exact local commands after approval

Run from the repository root in PowerShell. The existing Snowflake CLI connection name remains a local environment value and is never committed.

```powershell
$env:RIPPLE_SNOW_CONNECTION = '<existing local Snowflake CLI connection>'
$rippleOpenSsl = 'E:\Softwares\Git\usr\bin\openssl.exe'
$rippleSecretDir = Join-Path (Get-Location) '.secrets'
$ripplePrivateKey = Join-Path $rippleSecretDir 'ripple_app_key.p8'
$ripplePublicKeyFile = Join-Path $rippleSecretDir 'ripple_app_key.pub'

New-Item -ItemType Directory -Path $rippleSecretDir -Force | Out-Null
& $rippleOpenSsl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out $ripplePrivateKey
& $rippleOpenSsl pkey -in $ripplePrivateKey -pubout -out $ripplePublicKeyFile

$ripplePublicKey = (Get-Content -LiteralPath $ripplePublicKeyFile |
  Where-Object { $_ -notmatch '^-----' }) -join ''

snow sql `
  --connection $env:RIPPLE_SNOW_CONNECTION `
  --filename scripts/preflight_provision.sql `
  --enable-templating STANDARD `
  --variable "rsa_public_key=$ripplePublicKey" `
  --local-only
```

The private key is an unencrypted PKCS#8 key because the Cloudflare Worker must import it with Web Crypto; it stays in the Git-ignored `.secrets/` directory during development and later becomes a Cloudflare encrypted secret only after a separate owner gate. The public key is safe to register in Snowflake but is also kept out of the repository to prevent account fingerprint disclosure.

If the configured OAuth session has expired, Snowflake CLI may open a browser and ask the owner to reauthenticate. The implementation agent must pause for that interactive login; credentials are never requested in chat.

## Immediate validation after creation

The first read-only checks will verify the public-key fingerprint, authenticate as `RIPPLE_APP_USER`, call only `RIPPLE.API.HEALTH()`, and prove that the app role cannot create objects or access the preflight schema. Then the bounded capability probes begin. Any failure is recorded and either cleaned up or mapped to the blueprint's fixed fallback; `AI_COMPLETE` failure stops the project.

## Reversal

Before P0 data exists, the preflight footprint can be removed in this order after explicit approval: service user, database, warehouse, resource monitor, child role, admin role, and local `.secrets/` key files. The teardown command will be written and reviewed before any removal.
