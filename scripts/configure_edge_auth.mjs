import { createHmac, randomBytes } from "node:crypto";
import { access, appendFile, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const varsPath = resolve(repositoryRoot, "apps", "edge-api", ".dev.vars");
const accessCodePath = resolve(repositoryRoot, ".secrets", "ripple_access_code.txt");

function assertInsideRepository(path) {
  const pathRelativeToRepository = relative(repositoryRoot, path);
  if (pathRelativeToRepository.startsWith("..") || pathRelativeToRepository === "") {
    throw new Error("Generated secret path is outside the repository.");
  }
}

assertInsideRepository(varsPath);
assertInsideRepository(accessCodePath);

const existing = await readFile(varsPath, "utf8");
if (/^(?:ACCESS_CODE_HMAC|LOGIN_PEPPER|SESSION_SIGNING_SECRET)=/mu.test(existing)) {
  throw new Error("Edge authentication bindings already exist; refusing to overwrite them.");
}
try {
  await access(accessCodePath);
  throw new Error("The ignored access-code file already exists; refusing to overwrite it.");
} catch (error) {
  if (error instanceof Error && !error.message.includes("ENOENT")) throw error;
}

const accessCode = randomBytes(16).toString("base64url");
const loginPepper = randomBytes(32).toString("base64url");
const sessionSecret = randomBytes(32).toString("base64url");
const accessCodeHmac = createHmac("sha256", loginPepper)
  .update(accessCode, "utf8")
  .digest("base64url");
const authBindings = {
  ACCESS_CODE_HMAC: accessCodeHmac,
  APP_ORIGIN: "http://localhost:3000",
  LOGIN_PEPPER: loginPepper,
  SESSION_SIGNING_SECRET: sessionSecret,
};
const lines = Object.entries(authBindings)
  .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
  .join("\n");
await appendFile(varsPath, `${lines}\n`, { encoding: "utf8" });
await writeFile(accessCodePath, `${accessCode}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
process.stdout.write(
  `${JSON.stringify({ bindingCount: Object.keys(authBindings).length, ok: true, accessCodePath: ".secrets/ripple_access_code.txt" })}\n`,
);
