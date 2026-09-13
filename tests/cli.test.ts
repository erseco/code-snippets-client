import { afterEach, expect, it } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli, clientOptions, normalizePhp } from "../src/cli.js";
import { server, json, body, sample } from "./helpers.js";
const clean: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(clean.splice(0).map((f) => f()));
});
async function folder() {
  const dir = await mkdtemp(join(tmpdir(), "snippets-cli-"));
  clean.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
const env = {
  WP_URL: "https://example.test",
  WP_USERNAME: "u",
  WP_PASSWORD: "p",
};
it("shows help without configuration", async () => {
  expect(await runCli([], {})).toContain("Commands:");
  expect(await runCli(["--help"], {})).toContain("--env-file");
});
it("builds the supported authentication configurations", () => {
  expect(
    clientOptions({ ...env, WP_USER_AGENT: "Mozilla/5.0" }).userAgent,
  ).toBe("Mozilla/5.0");
  expect(clientOptions(env).userAgent).toBeUndefined();
  expect(clientOptions(env).auth.type).toBe("application-password");
  expect(clientOptions({ ...env, WP_AUTH: "wordpress" }).auth.type).toBe(
    "wordpress",
  );
  expect(
    clientOptions({
      ...env,
      WP_AUTH: "session",
      WP_COOKIE: "a=b",
      WP_NONCE: "x",
    }).auth.type,
  ).toBe("session");
  expect(
    clientOptions({
      ...env,
      WP_AUTH: "cas",
      CAS_LOGIN_URL: "https://cas.test",
      CAS_SERVICE_URL: env.WP_URL,
      CAS_ENTRY_URL: env.WP_URL,
      WP_NETWORK: "true",
      WP_ADMIN_URL: env.WP_URL,
    }).auth.type,
  ).toBe("cas");
  expect(() => clientOptions({ ...env, WP_AUTH: "unknown" })).toThrow();
  expect(() => clientOptions({ ...env, WP_NETWORK: "yes" })).toThrow();
});
it("requires explicit confirmation and rejects incompatible arguments", async () => {
  for (const args of [
    ["create"],
    ["delete", "7"],
    ["get", "0"],
    ["list", "7"],
    ["unknown"],
    ["get", "7", "extra"],
    ["get", "7", "--file", "x"],
    ["get", "7", "--input", "x"],
    ["get", "7", "--output", "x"],
    ["get", "7", "--dry-run"],
    ["create", "--yes", "--enable", "--disable"],
  ])
    await expect(runCli(args, env)).rejects.toThrow();
});
it("normalizes only boundary PHP tags and line endings", () => {
  expect(normalizePhp('<?php\r\necho "x";\r\n?>')).toBe('echo "x";\n');
  expect(normalizePhp('?>\n<?php\necho "x";')).toBe('?>\n<?php\necho "x";');
});
it("loads an explicit environment and returns a dry-run without sending requests", async () => {
  const dir = await folder();
  const e = join(dir, ".env"),
    f = join(dir, "code.php");
  await writeFile(
    e,
    "WP_URL=https://example.test\nWP_USERNAME=u\nWP_PASSWORD=p",
  );
  await writeFile(f, "<?php\necho 1;");
  expect(
    await runCli(
      [
        "create",
        "--env-file",
        e,
        "--file",
        f,
        "--name",
        "X",
        "--scope",
        "admin",
        "--priority",
        "4",
        "--disable",
        "--dry-run",
      ],
      {},
    ),
  ).toMatchObject({
    applied: false,
    changes: { name: "X", code: "echo 1;", priority: 4, active: false },
  });
});
it("operates on files and JSON without overwriting local files", async () => {
  let active = true;
  const s = await server(async (req, res) => {
    if (req.method === "GET")
      return json(
        res,
        new URL(req.url!, "http://test").searchParams
          .get("rest_route")!
          .includes("/7")
          ? { ...sample, active }
          : [sample],
      );
    if (req.url!.includes("deactivate")) active = false;
    if (req.url!.includes("activate") && !req.url!.includes("deactivate"))
      active = true;
    const p = req.method === "POST" ? JSON.parse(await body(req)) : {};
    json(res, { ...sample, ...p, active: !req.url!.includes("deactivate") });
  });
  clean.push(s.close);
  const local = { ...env, WP_URL: s.url, WP_ALLOW_HTTP: "true" };
  const dir = await folder(),
    file = join(dir, "s.php"),
    input = join(dir, "s.json"),
    output = join(dir, "out.php");
  await writeFile(file, "<?php\nold\n");
  await writeFile(
    input,
    JSON.stringify({ name: "x", code: "x", active: true }),
  );
  expect(await runCli(["list"], local)).toHaveLength(1);
  expect(await runCli(["get", "7"], local)).toMatchObject({ id: 7 });
  expect(await runCli(["diff", "7", "--file", file], local)).toMatchObject({
    equal: true,
  });
  await expect(runCli(["diff", "7"], local)).rejects.toThrow("--file");
  expect(await runCli(["pull", "7"], local)).toBe("old\n");
  await runCli(["pull", "7", "--output", output], local);
  expect(await readFile(output, "utf8")).toBe("old\n");
  await expect(
    runCli(["pull", "7", "--output", output], local),
  ).rejects.toThrow();
  await runCli(["create", "--input", input, "--yes"], local);
  await runCli(["update", "7", "--file", file, "--enable", "--yes"], local);
  await runCli(["push", "7", "--file", file, "--yes"], local);
  for (const c of ["activate", "deactivate", "delete", "restore"])
    await runCli([c, "7", "--yes"], local);
  await writeFile(input, "[]");
  await expect(
    runCli(["create", "--input", input, "--yes"], local),
  ).rejects.toThrow("JSON object");
});
it("validates dry-run payloads just like real writes", async () => {
  await expect(runCli(["create", "--dry-run"], env)).rejects.toThrow(
    "name and code",
  );
  await expect(runCli(["update", "7", "--dry-run"], env)).rejects.toThrow(
    "No changes",
  );
  await expect(
    runCli(["update", "7", "--priority", "bad", "--dry-run"], env),
  ).rejects.toThrow("Invalid snippet");
});
