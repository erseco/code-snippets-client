// Publish the tested tarball; retries only accept identical published contents.
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const { name, version } = JSON.parse(readFileSync("package.json"));
const files = readdirSync("artifacts").filter((f) => f.endsWith(".tgz"));
if (files.length !== 1) throw Error("Expected exactly one tested tarball");
const file = `./artifacts/${files[0]}`;
const integrity =
  "sha512-" + createHash("sha512").update(readFileSync(file)).digest("base64");
const response = await fetch(
  `https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`,
);
if (response.ok) {
  const published = await response.json();
  if (published.dist.integrity !== integrity)
    throw Error("Version already published with different contents");
  console.log(`${version} already published with identical contents`);
} else if (response.status === 404) {
  execFileSync("npm", ["publish", file, "--access", "public", "--provenance"], {
    stdio: "inherit",
  });
} else throw Error(`Registry returned HTTP ${response.status}`);
