import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(repositoryRoot, "apps", "edge-api", ".dev.vars");
const outputPath = resolve(repositoryRoot, ".secrets", "cloudflare-production.env");
const productionOrigin = "https://ripple.grimnej.com";
const requiredBindings = [
  "ACCESS_CODE_HMAC",
  "APP_ORIGIN",
  "LOGIN_PEPPER",
  "SESSION_SIGNING_SECRET",
  "SNOWFLAKE_ACCOUNT_LOCATOR",
  "SNOWFLAKE_HOST",
  "SNOWFLAKE_PRIVATE_KEY",
  "SNOWFLAKE_PUBLIC_KEY_FINGERPRINT",
  "SNOWFLAKE_USER",
];

function assertInsideRepository(path) {
  const pathRelativeToRepository = relative(repositoryRoot, path);
  if (pathRelativeToRepository.startsWith("..") || pathRelativeToRepository === "") {
    throw new Error("Secret configuration path is outside the repository.");
  }
}

assertInsideRepository(sourcePath);
assertInsideRepository(outputPath);

try {
  await access(outputPath);
  throw new Error("The ignored Cloudflare secret file already exists; refusing to overwrite it.");
} catch (error) {
  if (error instanceof Error && !error.message.includes("ENOENT")) throw error;
}

const source = await readFile(sourcePath, "utf8");
const bindingNames = new Set(
  source
    .split(/\r?\n/u)
    .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/u)?.[1])
    .filter(Boolean),
);
const missingBindings = requiredBindings.filter((name) => !bindingNames.has(name));
if (missingBindings.length > 0) {
  throw new Error(`Local edge configuration is missing: ${missingBindings.join(", ")}`);
}

const originPattern = /^APP_ORIGIN=.*$/mu;
const originMatches = source.match(new RegExp(originPattern.source, "gmu")) ?? [];
if (originMatches.length !== 1) {
  throw new Error("Expected exactly one APP_ORIGIN binding in the local edge configuration.");
}

const productionContents = source.replace(
  originPattern,
  `APP_ORIGIN=${JSON.stringify(productionOrigin)}`,
);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, productionContents, {
  encoding: "utf8",
  flag: "wx",
  mode: 0o600,
});

process.stdout.write(
  `${JSON.stringify({ bindingCount: requiredBindings.length, ok: true, origin: productionOrigin, path: ".secrets/cloudflare-production.env" })}\n`,
);
