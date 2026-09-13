// Opt-in public CAS test service; only a disposable local WordPress is modified.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { CodeSnippetsClient } from "../dist/index.js";

const cli = fileURLToPath(
  new URL("../node_modules/@wordpress/env/bin/wp-env", import.meta.url),
);
const run = (...args) =>
  execFileSync(process.execPath, [cli, "--config=.wp-env.cas.json", ...args], {
    encoding: "utf8",
    timeout: 300000,
  });
const wp = (...args) => run("run", "cli", "wp", "--skip-plugins", ...args);
const baseUrl = "http://localhost:8910";
const casUrl = "https://www.casserverpac4j.dev";
const username = "snippets_" + randomUUID().replaceAll("-", "");
let client;
let id;
try {
  process.stdout.write(run("start"));
  assert.equal(wp("core", "version").trim(), "6.9.5");
  assert.equal(
    wp("plugin", "get", "code-snippets", "--field=version").trim(),
    "3.9.6",
  );
  assert.equal(
    wp("plugin", "get", "wp-cassify", "--field=version").trim(),
    "2.4.9",
  );
  process.stdout.write(wp("eval", 'echo "PHP " . PHP_VERSION . "\\n";'));

  const settings = {
    wp_cassify_base_url: casUrl + "/",
    wp_cassify_login_servlet: "login",
    wp_cassify_logout_servlet: "logout",
    wp_cassify_service_validate_servlet: "p3/serviceValidate",
    wp_cassify_protocol_version: "3",
    wp_cassify_ssl_check_certificate: "enabled",
    wp_cassify_disable_authentication: "",
    wp_cassify_enable_url_bypass: "disabled",
    wp_cassify_create_user_if_not_exist: "disabled",
    wp_cassify_debug_log: "disabled",
    wp_cassify_xml_response_dump: "disabled",
  };
  const encoded = Buffer.from(JSON.stringify(settings)).toString("base64");
  wp(
    "eval",
    `foreach (json_decode(base64_decode('${encoded}'), true) as $key => $value) { update_option($key, $value); }`,
  );
  // The WordPress password differs from CAS, so native login cannot pass this test.
  wp(
    "user",
    "create",
    username,
    `${username}@example.test`,
    "--role=administrator",
    `--user_pass=${randomUUID()}`,
  );
  const options = {
    baseUrl,
    allowInsecureHttp: true,
    timeoutMs: 60000,
    auth: {
      type: "cas",
      loginUrl: casUrl + "/login",
      username,
      password: "password",
    },
  };
  const wrong = new CodeSnippetsClient({
    ...options,
    auth: { ...options.auth, password: "incorrect-test-password" },
  });
  await assert.rejects(() => wrong.login());
  client = new CodeSnippetsClient(options);
  await client.login();
  const snippet = await client.create({
    name: username,
    code: "// CAS integration test",
  });
  id = snippet.id;
  assert.ok((await client.list()).some((s) => s.id === id));
  assert.equal(
    (await client.update(id, { desc: "Updated through CAS" })).desc,
    "Updated through CAS",
  );
  assert.equal((await client.activate(id)).active, true);
  assert.equal((await client.deactivate(id)).active, false);
  assert.equal(await client.delete(id), null);
  console.log(
    "PASS: public CAS -> Cassify 2.4.9 -> WordPress session and REST nonce -> Code Snippets 3.9.6 CRUD; invalid password rejected.",
  );
} finally {
  // Remove only this test's records, including a snippet created before an API error.
  try {
    wp(
      "eval",
      `global $wpdb; $wpdb->delete($wpdb->prefix . 'snippets', ['name' => '${username}']);`,
    );
    wp("user", "delete", username, "--yes");
  } catch {
    console.error(
      "CAS fixture cleanup was incomplete; the environment is disposable.",
    );
  }
  process.stdout.write(run("stop"));
}
