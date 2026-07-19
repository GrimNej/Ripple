# Dependency ledger

The initial JavaScript stack lock was verified against current package metadata on 2026-07-19. All direct dependencies are exactly pinned. `pnpm audit --audit-level moderate` reports no known vulnerabilities after forcing PostCSS 8.5.19 over Next.js's vulnerable transitive pin.

## Runtime and build dependencies

| Workspace | Package                | Version | Licence | Official source                          | Purpose / execution role                     |
| --------- | ---------------------- | ------- | ------- | ---------------------------------------- | -------------------------------------------- |
| Web       | `next`                 | 16.2.10 | MIT     | [Next.js](https://nextjs.org/)           | Static export compiler and application shell |
| Web       | `react`                | 19.2.7  | MIT     | [React](https://react.dev/)              | Escaped, accessible component rendering      |
| Web       | `react-dom`            | 19.2.7  | MIT     | [React](https://react.dev/)              | Browser DOM renderer                         |
| Web       | `tailwindcss`          | 4.3.3   | MIT     | [Tailwind CSS](https://tailwindcss.com/) | Token-driven CSS build layer                 |
| Web       | `@tailwindcss/postcss` | 4.3.3   | MIT     | [Tailwind CSS](https://tailwindcss.com/) | PostCSS integration                          |
| Edge      | `hono`                 | 4.12.31 | MIT     | [Hono](https://hono.dev/)                | Cloudflare Worker routing only               |
| Edge      | `zod`                  | 4.4.3   | MIT     | [Zod](https://zod.dev/)                  | Runtime validation for API and SQL envelopes |

## Development dependencies

| Scope     | Package                           | Version      | Licence           | Official source                                                                          | Purpose                                                        |
| --------- | --------------------------------- | ------------ | ----------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Root      | `typescript`                      | 6.0.3        | Apache-2.0        | [TypeScript](https://www.typescriptlang.org/)                                            | Strict static typing; compatible with the selected lint parser |
| Root      | `eslint` / `@eslint/js`           | 9.39.5       | MIT               | [ESLint](https://eslint.org/)                                                            | Zero-warning lint gate                                         |
| Root      | `eslint-config-next`              | 16.2.10      | MIT               | [Next.js ESLint](https://nextjs.org/docs/app/api-reference/config/eslint)                | Next.js and accessibility-aware lint rules                     |
| Root      | `typescript-eslint`               | 8.64.0       | MIT               | [typescript-eslint](https://typescript-eslint.io/)                                       | Type-aware strict linting                                      |
| Root      | `prettier`                        | 3.9.5        | MIT               | [Prettier](https://prettier.io/)                                                         | Deterministic formatting gate                                  |
| Root/Edge | `@types/node`                     | 26.1.1       | MIT               | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)                    | Node tooling/test types only                                   |
| Web       | `@types/react`                    | 19.2.17      | MIT               | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)                    | React compile-time types                                       |
| Web       | `@types/react-dom`                | 19.2.3       | MIT               | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)                    | React DOM compile-time types                                   |
| Edge      | `wrangler`                        | 4.112.0      | MIT OR Apache-2.0 | [Cloudflare Wrangler](https://developers.cloudflare.com/workers/wrangler/)               | Local runtime, type generation, profiling, dry-run, deployment |
| Edge      | `@cloudflare/workers-types`       | 5.20260719.1 | MIT OR Apache-2.0 | [Workers types](https://www.npmjs.com/package/@cloudflare/workers-types)                 | Current platform API types                                     |
| Edge      | `vitest`                          | 4.1.10       | MIT               | [Vitest](https://vitest.dev/)                                                            | Unit and CPU preflight tests                                   |
| Edge      | `@cloudflare/vitest-pool-workers` | 0.18.6       | MIT               | [Workers testing](https://developers.cloudflare.com/workers/testing/vitest-integration/) | Workerd-native integration test support                        |

## Resolution override

| Package   | Forced version | Reason                                                                 | Advisory evidence                              |
| --------- | -------------- | ---------------------------------------------------------------------- | ---------------------------------------------- |
| `postcss` | 8.5.19         | Replaces vulnerable transitive 8.4.31 while remaining within PostCSS 8 | GHSA-qx2v-qp2m-jg93; clean audit on 2026-07-19 |

## Python development and Snowpark dependencies

| Package                      | Version | Licence    | Official source                                                                     | Purpose                                                        |
| ---------------------------- | ------- | ---------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `snowflake-snowpark-python`  | 1.53.0  | Apache-2.0 | [Snowpark Python](https://docs.snowflake.com/en/developer-guide/snowpark/python/)   | Account-matched Python 3.11 procedure/runtime contract         |
| `snowflake-connector-python` | 4.7.1   | Apache-2.0 | [Python connector](https://docs.snowflake.com/en/developer-guide/python-connector/) | Reproducible fixture upload and integration verification       |
| `chardet`                    | 5.2.0   | LGPL       | [chardet](https://github.com/chardet/chardet)                                       | Connector-compatible transitive pin; prevents invalid v7 range |
| `pytest`                     | 9.1.1   | MIT        | [pytest](https://docs.pytest.org/)                                                  | Python unit and integration test runner                        |
| `hypothesis`                 | 6.156.9 | MPL-2.0    | [Hypothesis](https://hypothesis.readthedocs.io/)                                    | Unicode/offset/parser property testing                         |
| `mypy`                       | 2.3.0   | MIT        | [mypy](https://www.mypy-lang.org/)                                                  | Strict owned-Python type gate                                  |
| `ruff`                       | 0.15.22 | MIT        | [Ruff](https://docs.astral.sh/ruff/)                                                | Python lint and deterministic format gate                      |
| `sqlfluff`                   | 4.2.2   | MIT        | [SQLFluff](https://www.sqlfluff.com/)                                               | Snowflake-dialect SQL lint gate                                |

These exact versions were resolved and metadata-checked on 2026-07-19. The Python connector dependency set was also checked through the project audit workflow before the phase gate.

## Local toolchain

| Tool            |          Version | Role                                                   |
| --------------- | ---------------: | ------------------------------------------------------ |
| Git             | 2.51.0.windows.2 | Version control                                        |
| Node.js         |          24.14.0 | JavaScript runtime target                              |
| pnpm            |           11.7.0 | Workspace package manager and supply-chain policy gate |
| Python          |           3.11.0 | Snowpark/tooling runtime target                        |
| uv              |          0.11.18 | Python environment/package manager                     |
| Snowflake CLI   |           3.23.0 | Snowflake scripting and verification                   |
| Cortex Code CLI |           1.1.41 | Substantive CoCo/Snowflake collaboration               |

New direct dependencies after this lock require an explicit ledger entry, current advisory check, exact version, licence, official source, purpose, and owner authorization already granted for blueprint-required packages.
