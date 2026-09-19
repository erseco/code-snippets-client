import { afterEach, describe, expect, it } from "vitest";
import { CodeSnippetsClient, CodeSnippetsError } from "../src/index.js";
import { server, json, body, sample } from "./helpers.js";
const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(stops.splice(0).map((f) => f()));
});
async function setup(handler: Parameters<typeof server>[0]) {
  const s = await server(handler);
  stops.push(s.close);
  return new CodeSnippetsClient({
    baseUrl: s.url + "/subsite",
    auth: { type: "application-password", username: "u", password: "p" },
    allowInsecureHttp: true,
  });
}

describe("Code Snippets REST contract", () => {
  it("omits false network query strings that legacy multisite treats as true", async () => {
    const s = await server(async (req, res) => {
      const url = new URL(req.url!, "http://fixture");
      expect(url.searchParams.has("network")).toBe(false);
      const route = url.searchParams.get("rest_route")!;
      if (req.method === "GET") {
        json(res, route.endsWith("/snippets") ? [sample] : sample);
      } else {
        const payload = JSON.parse(await body(req));
        expect(payload.network).toBe(false);
        json(res, { ...sample, ...payload });
      }
    });
    stops.push(s.close);
    for (const network of [undefined, false]) {
      const client = new CodeSnippetsClient({
        baseUrl: s.url + "/subsite",
        auth: { type: "application-password", username: "u", password: "p" },
        allowInsecureHttp: true,
        ...(network === undefined ? {} : { network }),
      });
      await client.list();
      await client.get(7);
      await client.create({ name: "New", code: "// new" });
      await client.update(7, { code: "// update" });
    }
  });

  it("accepts 3.9.6 responses without inventing a trash state", async () => {
    const legacy: Record<string, unknown> = { ...sample };
    delete legacy.trashed;
    const c = await setup((req, res) => json(res, legacy));
    expect(await c.get(7)).not.toHaveProperty("trashed");
    legacy.trashed = "invalid";
    await expect(c.get(7)).rejects.toMatchObject({ code: "RESPONSE" });
  });

  it("lists, queries and preserves subsite query routing", async () => {
    const client = await setup((req, res) => {
      const u = new URL(req.url!, "http://test");
      expect(u.pathname).toBe("/subsite/");
      expect(u.searchParams.get("rest_route")).toBe(
        "/code-snippets/v1/snippets",
      );
      expect(u.searchParams.get("per_page")).toBe("50");
      expect(u.searchParams.get("page")).toBe("2");
      expect(u.searchParams.get("search")).toBe("a & b");
      expect(req.headers.authorization).toBe("Basic dTpw");
      json(res, [{ ...sample, code: "a\r\nb" }]);
    });
    expect(
      (
        await client.list({
          page: 2,
          perPage: 50,
          search: "a & b",
          status: "active",
        })
      )[0]?.code,
    ).toBe("a\nb");
  });
  it("creates inactive by default and preserves update metadata", async () => {
    const posted: Record<string, unknown>[] = [];
    const c = await setup(async (req, res) => {
      if (req.method === "GET") return json(res, sample);
      const p = JSON.parse(await body(req)) as Record<string, unknown>;
      posted.push(p);
      json(res, { ...sample, ...p });
    });
    expect((await c.create({ name: "New", code: "new" })).active).toBe(false);
    await c.update(7, { code: "new" });
    expect(posted[1]).toMatchObject({
      name: "Demo",
      tags: ["keep"],
      priority: 8,
      desc: "Keep",
      active: true,
    });
  });
  it("restores an active snippet deactivated on save exactly once", async () => {
    const paths: string[] = [];
    const c = await setup((req, res) => {
      paths.push(req.url!);
      json(res, {
        ...sample,
        active: req.method === "GET" || req.url!.includes("activate"),
      });
    });
    expect((await c.update(7, { code: "function changed() {}" })).active).toBe(
      true,
    );
    expect(paths).toHaveLength(4);
    expect(paths.filter((p) => p.includes("activate"))).toHaveLength(1);
  });
  it("does not activate a snippet the save kept active", async () => {
    const paths: string[] = [];
    const c = await setup((req, res) => {
      paths.push(req.url!);
      json(res, sample);
    });
    expect((await c.update(7, { code: "function kept() {}" })).active).toBe(
      true,
    );
    expect(paths).toHaveLength(2);
    expect(paths.some((p) => p.includes("activate"))).toBe(false);
  });
  it("never implicitly rearms single-use even across a scope change", async () => {
    const writes: Record<string, unknown>[] = [];
    const c = await setup(async (req, res) => {
      if (req.method === "GET")
        return json(res, { ...sample, scope: "single-use" });
      const p = JSON.parse(await body(req));
      writes.push(p);
      json(res, { ...sample, ...p, active: false });
    });
    await c.update(7, { code: "once" });
    await c.update(7, { scope: "global" });
    expect(writes).toHaveLength(2);
    expect(writes.every((p) => !("active" in p))).toBe(true);
  });
  it("refuses locked code and name changes before writing", async () => {
    const writes: string[] = [];
    const c = await setup((req, res) => {
      if (req.method !== "GET") writes.push(req.url!);
      json(res, { ...sample, locked: true });
    });
    for (const changes of [{ code: "secret()" }, { name: "Renamed" }]) {
      const error = await c.update(7, changes).catch((e) => e);
      expect(error).toBeInstanceOf(CodeSnippetsError);
      expect(error.code).toBe("STATE");
      expect(error.message).toContain("Snippet 7 is locked");
      expect(error.message).not.toContain("secret");
      expect(error.message).not.toContain("Renamed");
    }
    expect(writes).toHaveLength(0);
  });
  it("updates metadata and equivalent code while locked", async () => {
    const posted: Record<string, unknown>[] = [];
    const c = await setup(async (req, res) => {
      if (req.method === "GET") return json(res, { ...sample, locked: true });
      const p = JSON.parse(await body(req)) as Record<string, unknown>;
      posted.push(p);
      // The controller keeps the stored lock for a request without the field, and
      // Code Snippets restores the protected fields of a snippet that stays locked.
      json(res, {
        ...sample,
        ...p,
        locked: true,
        code: sample.code,
        name: sample.name,
      });
    });
    const updated = await c.update(7, { desc: "Updated description" });
    expect(posted[0]).not.toHaveProperty("locked");
    expect(updated.locked).toBe(true);
    expect(updated.desc).toBe("Updated description");
    expect(updated.code).toBe(sample.code);
    expect(updated.name).toBe(sample.name);
    expect(
      (await c.update(7, { code: "old\r\n", desc: "Same code" })).locked,
    ).toBe(true);
  });
  it("allows an explicit unlock together with protected changes", async () => {
    const posted: Record<string, unknown>[] = [];
    const c = await setup(async (req, res) => {
      if (req.method === "GET") return json(res, { ...sample, locked: true });
      const p = JSON.parse(await body(req)) as Record<string, unknown>;
      posted.push(p);
      json(res, { ...sample, ...p });
    });
    expect((await c.update(7, { locked: false, code: "new()" })).code).toBe(
      "new()",
    );
    expect((await c.update(7, { locked: false, name: "Renamed" })).name).toBe(
      "Renamed",
    );
    expect(posted.every((p) => p.locked === false)).toBe(true);
  });
  it("detects a snippet locked between the read and the write", async () => {
    const paths: string[] = [];
    // A second process locks the snippet after the read; the update omits the
    // lock, so the server keeps it and restores the protected fields.
    let locked = false;
    const c = await setup(async (req, res) => {
      paths.push(req.url!);
      if (req.method === "GET") {
        const current = locked;
        locked = true;
        return json(res, { ...sample, locked: current });
      }
      const p = JSON.parse(await body(req)) as Record<string, unknown>;
      expect(p).not.toHaveProperty("locked");
      json(res, {
        ...sample,
        ...p,
        locked: true,
        code: sample.code,
        active: false,
      });
    });
    const error = await c.update(7, { code: "secret()" }).catch((e) => e);
    expect(error).toBeInstanceOf(CodeSnippetsError);
    expect(error.code).toBe("STATE");
    expect(error.message).toContain("was not updated");
    expect(error.message).not.toContain("secret");
    // A discarded write is not followed by another mutation.
    expect(paths.some((p) => p.includes("activate"))).toBe(false);
  });
  it("does not activate inactive snippets and handles explicit state", async () => {
    const c = await setup(async (req, res) => {
      const p = req.method === "POST" ? JSON.parse(await body(req)) : {};
      json(res, { ...sample, active: false, ...p });
    });
    expect((await c.update(7, { code: "new" })).active).toBe(false);
    expect((await c.update(7, { active: true })).active).toBe(true);
    expect((await c.deactivate(7)).active).toBe(false);
  });
  it("reports refused activation and code errors without leaking source", async () => {
    const c = await setup((req, res) =>
      json(res, {
        ...sample,
        active: false,
        code_error: req.url!.includes("deactivate")
          ? { message: "private source" }
          : null,
      }),
    );
    await expect(c.activate(7)).rejects.toMatchObject({ code: "STATE" });
    const broken = await setup((req, res) =>
      json(res, { ...sample, code_error: { message: "private source" } }),
    );
    await expect(broken.deactivate(7)).rejects.toThrow("code error");
    await expect(
      c.create({ name: "x", code: "secret", active: true }),
    ).rejects.toMatchObject({ code: "STATE" });
  });
  it("accepts consumed explicit single-use activations", async () => {
    const c = await setup((req, res) =>
      json(res, { ...sample, scope: "single-use", active: false }),
    );
    expect((await c.activate(7)).active).toBe(false);
  });
  it("supports trash, permanent deletion and restore", async () => {
    let calls = 0;
    const c = await setup((req, res) => {
      calls++;
      if (calls === 2) {
        res.writeHead(204);
        res.end();
      } else json(res, { ...sample, trashed: calls === 1 });
    });
    expect((await c.delete(7))?.trashed).toBe(true);
    expect(await c.delete(7)).toBeNull();
    expect((await c.restore(7)).trashed).toBe(false);
  });
  it("sends network in query and write body", async () => {
    const s = await server(async (req, res) => {
      expect(req.url).toContain("network=true");
      if (req.method === "POST")
        expect(JSON.parse(await body(req)).network).toBe(true);
      json(res, { ...sample, network: true, active: false });
    });
    stops.push(s.close);
    const c = new CodeSnippetsClient({
      baseUrl: s.url,
      network: true,
      allowInsecureHttp: true,
      auth: { type: "session", cookie: "wp=ok", nonce: "abcdef1234" },
    });
    await c.get(7);
    await c.create({ name: "x", code: "x" });
  });
  it.each([401, 403, 404, 500])(
    "returns safe HTTP errors (%s)",
    async (status) => {
      const c = await setup((req, res) =>
        json(res, { secret: "never print me" }, status),
      );
      await expect(c.get(7)).rejects.toMatchObject({ status });
      await expect(c.get(7)).rejects.not.toThrow("never print");
    },
  );
  it("rejects HTML, invalid collections and invalid snippets", async () => {
    let n = 0;
    const c = await setup((req, res) => {
      n++;
      if (n === 1) {
        res.end("<html>secret</html>");
      } else json(res, n === 2 ? {} : [{}]);
    });
    await expect(c.get(7)).rejects.toMatchObject({ code: "RESPONSE" });
    await expect(c.list()).rejects.toMatchObject({ code: "RESPONSE" });
    await expect(c.list()).rejects.toMatchObject({ code: "RESPONSE" });
  });
  it("validates input before making requests", async () => {
    const c = await setup(() => {
      throw Error("should not request");
    });
    for (const id of [0, -1, NaN, 1.5])
      await expect(c.get(id)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(c.create({ name: "", code: "x" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(c.update(7, {})).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(c.update(7, { priority: -1 })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(c.update(7, { tags: [3] } as never)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(c.update(7, { unknown: true } as never)).rejects.toMatchObject(
      { code: "VALIDATION" },
    );
    for (const options of [
      { page: 0 },
      { perPage: 101 },
      { status: "bad" },
      { nope: "bad" },
    ])
      await expect(c.list(options as never)).rejects.toMatchObject({
        code: "VALIDATION",
      });
  });
  it("validates configuration", () => {
    const options = {
      baseUrl: "https://example.test",
      auth: {
        type: "application-password" as const,
        username: "x",
        password: "x",
      },
    };
    for (const baseUrl of [
      "bad",
      "http://example.test",
      "https://u:p@example.test",
      "https://example.test#x",
      "https://example.test?q=x",
    ])
      expect(() => new CodeSnippetsClient({ ...options, baseUrl })).toThrow(
        CodeSnippetsError,
      );
    expect(
      () => new CodeSnippetsClient({ ...options, timeoutMs: 0 }),
    ).toThrow();
    expect(
      () =>
        new CodeSnippetsClient({ ...options, adminUrl: "https://other.test" }),
    ).toThrow();
    expect(
      () =>
        new CodeSnippetsClient({ ...options, auth: { type: "bad" } as never }),
    ).toThrow();
    expect(
      () =>
        new CodeSnippetsClient({
          ...options,
          auth: { type: "wordpress", username: "", password: "" },
        }),
    ).toThrow();
  });
});

it("reads persisted state after empty activation bodies and HTTP 204 restoration", async () => {
  let active = false;
  const c = await setup((req, res) => {
    if (req.method === "GET") return json(res, { ...sample, active });
    if (req.url!.includes("restore")) {
      res.writeHead(204);
      res.end();
      return;
    }
    active = !req.url!.includes("deactivate");
    json(res, {});
  });
  expect((await c.activate(7)).active).toBe(true);
  expect((await c.deactivate(7)).active).toBe(false);
  expect((await c.restore(7)).trashed).toBe(false);
});
it("rejects null snippet bodies and invalid metadata responses", async () => {
  const c = await setup((req, res) => json(res, null));
  await expect(c.get(7)).rejects.toMatchObject({ code: "RESPONSE" });
  await expect(c.create(null as never)).rejects.toMatchObject({
    code: "VALIDATION",
  });
  const bad = await setup((req, res) => json(res, { ...sample, tags: [42] }));
  await expect(bad.get(7)).rejects.toMatchObject({ code: "RESPONSE" });
});

it("rejects invalid User-Agent values before any request", () => {
  for (const userAgent of [
    "",
    "  ",
    "bad\r\nInjected: value",
    "bad\0",
    "🧪",
    42,
  ]) {
    expect(
      () =>
        new CodeSnippetsClient({
          baseUrl: "https://example.test",
          auth: { type: "application-password", username: "u", password: "p" },
          userAgent: userAgent as string,
        }),
    ).toThrow(/User-Agent/);
  }
});
