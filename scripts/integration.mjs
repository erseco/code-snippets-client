// Disposable WordPress only: never accepts production targets or credentials.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { CodeSnippetsClient } from "../dist/index.js";
const config = JSON.parse(
  readFileSync(new URL("../.wp-env.json", import.meta.url), "utf8"),
);
const version = process.env.TEST_CODE_SNIPPETS_VERSION;
if (version) {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  config.plugins = [
    `https://downloads.wordpress.org/plugin/code-snippets.${version}.zip`,
  ];
}
// wp-env mounts plugins as directories; select the version before creating containers.
writeFileSync(
  ".wp-env.integration.json",
  JSON.stringify(config, null, 2) + "\n",
);
const baseUrl = `http://localhost:${config.port}`;
const cli = fileURLToPath(
  new URL("../node_modules/@wordpress/env/bin/wp-env", import.meta.url),
);
const run = (...args) =>
  execFileSync(
    process.execPath,
    [cli, "--config=.wp-env.integration.json", ...args],
    {
      encoding: "utf8",
      timeout: 300000,
    },
  );
const wp = (...args) => run("run", "cli", "wp", ...args);
const key = "client_test_" + randomUUID().replaceAll("-", "");
const ids = [];
let client;
try {
  process.stdout.write(run("start"));
  process.stdout.write(wp("core", "version"));
  process.stdout.write(wp("eval", "echo PHP_VERSION;"));
  process.stdout.write(wp("plugin", "get", "code-snippets", "--field=version"));
  const options = {
    baseUrl,
    allowInsecureHttp: true,
    auth: { type: "wordpress", username: "admin", password: "password" },
  };
  client = new CodeSnippetsClient(options);
  await client.login();
  const created = await client.create({
    name: key,
    code: "// integration test",
    desc: "keep",
    tags: ["integration"],
    priority: 8,
  });
  ids.push(created.id);
  assert.equal(created.active, false);
  assert.ok((await client.list()).some((s) => s.id === created.id));
  const updated = await client.update(created.id, { code: "// updated" });
  assert.equal(updated.desc, "keep");
  assert.deepEqual(updated.tags, ["integration"]);
  assert.equal(updated.priority, 8);
  assert.equal((await client.activate(created.id)).active, true);
  assert.equal(
    (
      await client.update(created.id, {
        code: `if (!function_exists('${key}')) { function ${key}() { return 1; } }`,
      })
    ).active,
    true,
  );
  assert.equal(
    (
      await client.update(created.id, {
        code: `if (!function_exists('${key}')) { function ${key}() { return 2; } }`,
      })
    ).active,
    true,
  );
  assert.equal((await client.deactivate(created.id)).active, false);
  // Application password generated exclusively inside the local container.
  const output = wp(
    "user",
    "application-password",
    "create",
    "admin",
    key,
    "--porcelain",
  );
  const password = output
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => /^[a-zA-Z0-9]{24}$/.test(s));
  assert.ok(password, "Application password not found in wp-env output");
  const app = new CodeSnippetsClient({
    ...options,
    auth: { type: "application-password", username: "admin", password },
  });
  assert.equal((await app.get(created.id)).id, created.id);
  const lowUser = "reader_" + key.slice(-8);
  wp(
    "user",
    "create",
    lowUser,
    `${lowUser}@example.test`,
    "--role=subscriber",
    "--user_pass=local-test-only",
  );
  const denied = new CodeSnippetsClient({
    ...options,
    auth: { type: "wordpress", username: lowUser, password: "local-test-only" },
  });
  await assert.rejects(() => denied.list());
  wp("user", "delete", lowUser, "--yes");
  const once = await client.create({
    name: key + "_once",
    scope: "single-use",
    code: `update_option('${key}', (int) get_option('${key}', 0) + 1);`,
  });
  ids.push(once.id);
  await client.activate(once.id);
  await fetch(baseUrl);
  await fetch(baseUrl);
  assert.equal((await client.get(once.id)).active, false);
  await client.update(once.id, { desc: "still consumed" });
  await fetch(baseUrl);
  const count = wp("--skip-plugins", "option", "get", key);
  assert.match(count, /(?:^|\n)1\s*(?:\n|$)/);
  if (created.trashed === undefined) {
    assert.equal(await client.delete(created.id), null);
    await assert.rejects(() => client.restore(created.id), { status: 404 });
    const trashed = wp(
      "eval",
      `echo (int) Code_Snippets\\get_snippet(${created.id})->is_trashed();`,
    );
    assert.match(trashed, /(?:^|\n)1\s*(?:\n|$)/);
  } else {
    assert.equal((await client.delete(created.id)).trashed, true);
    assert.equal((await client.restore(created.id)).trashed, false);
    assert.equal((await client.delete(created.id)).trashed, true);
    assert.equal(await client.delete(created.id), null);
    ids.splice(ids.indexOf(created.id), 1);
  }
  console.log(
    "PASS: WordPress / Code Snippets integration: CRUD, metadata, double declaration, application password, login, permissions, single-use and supported trash/restore/delete operations.",
  );
} finally {
  for (const id of ids) {
    try {
      wp("eval", `Code_Snippets\\delete_snippet(${id});`);
    } catch {
      console.error(`Could not clean up disposable snippet ${id}`);
    }
  }
  try {
    wp("--skip-plugins", "option", "delete", key);
    wp("user", "application-password", "delete", "admin", "--all");
  } catch {
    /* The disposable environment may be incomplete. */
  }
  process.stdout.write(run("stop"));
}
