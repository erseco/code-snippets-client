import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
// npm_execpath also works on Windows without invoking a .cmd through a shell.
const npm = (args, cwd = process.cwd()) =>
  execFileSync(process.execPath, [process.env.npm_execpath, ...args], {
    cwd,
    encoding: "utf8",
  });
mkdirSync("artifacts", { recursive: true });
const [pack] = JSON.parse(
  npm([
    "pack",
    "--ignore-scripts",
    "--json",
    "--pack-destination",
    "artifacts",
  ]),
);
for (const file of pack.files)
  assert.match(
    file.path,
    /^(dist\/[\w.-]+\.(js|d\.ts)|docs\/[\w.-]+\.md|README\.md|LICENSE|package\.json)$/,
  );
assert.ok(pack.files.some((f) => f.path === "dist/bin.js"));
const temporary = mkdtempSync(join(tmpdir(), "code-snippets-package-"));
try {
  npm(
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      resolve("artifacts", pack.filename),
    ],
    temporary,
  );
  const check =
    "import {CodeSnippetsClient} from '@erseco/code-snippets-client'; if(typeof CodeSnippetsClient !== 'function') process.exit(1)";
  execFileSync(process.execPath, ["--input-type=module", "-e", check], {
    cwd: temporary,
  });
  const installed = join(
    temporary,
    "node_modules",
    "@erseco",
    "code-snippets-client",
  );
  const help = execFileSync(
    process.execPath,
    [join(installed, "dist", "bin.js"), "--help"],
    { encoding: "utf8" },
  );
  assert.match(help, /Commands:/);
  assert.equal(
    JSON.parse(readFileSync(join(installed, "package.json"))).version,
    pack.version,
  );
  console.log(
    `PASS: ${pack.filename}, ${pack.files.length} allowed files, import and CLI from installed package`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
