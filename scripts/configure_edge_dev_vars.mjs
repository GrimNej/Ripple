import { createHash, createPrivateKey, createPublicKey } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(repositoryRoot, "apps", "edge-api", ".dev.vars");
const privateKeyPath = resolve(repositoryRoot, ".secrets", "ripple_app_key.p8");

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function assertInsideRepository(path) {
  const pathRelativeToRepository = relative(repositoryRoot, path);
  if (pathRelativeToRepository.startsWith("..") || pathRelativeToRepository === "") {
    throw new Error("Generated secret configuration path is outside the repository.");
  }
}

assertInsideRepository(outputPath);
assertInsideRepository(privateKeyPath);

try {
  await access(outputPath);
  throw new Error("The ignored edge .dev.vars file already exists; refusing to overwrite it.");
} catch (error) {
  if (error instanceof Error && !error.message.includes("ENOENT")) throw error;
}

const privateKeyPem = await readFile(privateKeyPath, "utf8");
const privateKey = createPrivateKey(privateKeyPem);
const publicKey = createPublicKey(privateKey).export({ format: "der", type: "spki" });
const publicKeyFingerprint = createHash("sha256").update(publicKey).digest("base64");
const bindings = {
  SNOWFLAKE_ACCOUNT_LOCATOR: requireEnvironment("RIPPLE_SNOWFLAKE_ACCOUNT_LOCATOR"),
  SNOWFLAKE_HOST: requireEnvironment("RIPPLE_SNOWFLAKE_HOST"),
  SNOWFLAKE_PRIVATE_KEY: privateKeyPem,
  SNOWFLAKE_PUBLIC_KEY_FINGERPRINT: publicKeyFingerprint,
  SNOWFLAKE_USER: "RIPPLE_APP_USER",
};
const contents = `${Object.entries(bindings)
  .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
  .join("\n")}\n`;

await writeFile(outputPath, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
process.stdout.write(
  `${JSON.stringify({ bindingCount: Object.keys(bindings).length, ok: true, path: "apps/edge-api/.dev.vars" })}\n`,
);
