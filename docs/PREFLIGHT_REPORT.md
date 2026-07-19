# Capability preflight report

**Status:** Not executed. Owner approval is required before any Snowflake resources or application key are created.

## Local baseline

| Capability | Evidence | Result |
|---|---|---|
| Node.js 24 | `node --version` → 24.14.0 | Ready for local probe |
| Python 3.11 | `python --version` → 3.11.0 | Ready for local probe |
| Snowflake CLI | `snow --version` → 3.23.0 | Installed; account capability not probed |
| CoCo CLI | `cortex --version` → 1.1.41 | Installed; authenticated session not invoked by this build |
| pnpm | `pnpm --version` → 11.7.0 | Ready for stack lock |

## Required cloud probes

The approved preflight must test SQL API key-pair authentication, Snowpark Python 3.11 procedures, strict-schema `AI_COMPLETE` and model availability, Stream/root/child task behavior, optional `AI_EMBED`, static Next.js export, local Worker JWT plus one read-only Snowflake query, and compressed Worker bundle/CPU evidence.

No capability will be marked passing from documentation or prior recollection. Sanitized commands/outputs, account/region limitations, exact fallback decisions, and measured results will be added after execution.
