import { afterEach, expect, it } from "vitest";
import { CodeSnippetsClient } from "../src/index.js";
import { Session } from "../src/session.js";
import { server, json, body, sample } from "./helpers.js";
const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(stops.splice(0).map((f) => f()));
});
const noncePage =
  '<script>wp.apiFetch.createNonceMiddleware("abcdef1234")</script>';

it("logs into WordPress, keeps cookies, and authenticates concurrent calls only once", async () => {
  let posts = 0;
  const s = await server(async (req, res) => {
    if (req.url === "/wp-login.php" && req.method === "GET") {
      res.setHeader("set-cookie", "test=1; Path=/");
      res.end('<form method="post"><input type="password" name="pwd"></form>');
    } else if (req.method === "POST") {
      posts++;
      expect(req.headers.cookie).toContain("test=1");
      expect(new URLSearchParams(await body(req)).get("pwd")).toBe("secret");
      res.writeHead(302, {
        "set-cookie": "wp=ok; Path=/",
        location: "/wp-admin/",
      });
      res.end();
    } else if (req.url!.includes("rest_route")) {
      expect(req.headers.cookie).toContain("wp=ok");
      expect(req.headers["x-wp-nonce"]).toBe("abcdef1234");
      json(res, sample);
    } else {
      expect(req.headers.cookie).toContain("wp=ok");
      res.end(noncePage);
    }
  });
  stops.push(s.close);
  const c = new CodeSnippetsClient({
    baseUrl: s.url,
    allowInsecureHttp: true,
    auth: { type: "wordpress", username: "admin", password: "secret" },
  });
  await Promise.all([c.get(7), c.get(7)]);
  expect(posts).toBe(1);
});

it("follows the Cassify callback and preserves Apereo hidden form fields", async () => {
  let wpUrl = "";
  let service = "";
  const cas = await server(async (req, res) => {
    const url = new URL(req.url!, "http://cas");
    if (req.method === "GET") {
      service = url.searchParams.get("service")!;
      res.setHeader("set-cookie", "cas=one; Path=/cas");
      res.end(
        `<form><input name='unrelated' type='hidden' value='ignore'></form><form action="/cas/login?service=${encodeURIComponent(service)}" method='post'><input value='token&amp;value' name='execution' type='hidden'><input name='lt' type='hidden' value='LT-1'><input name='disabled' type='hidden' disabled value='ignore'><input type='hidden' value='nameless'><input name='empty' type='hidden'><input name='visible' value='ignore'><div><input name='password' type='PASSWORD'></div></form>`,
      );
    } else {
      const p = new URLSearchParams(await body(req));
      expect(req.headers.cookie).toBe("cas=one");
      expect(p.get("execution")).toBe("token&value");
      expect(p.get("lt")).toBe("LT-1");
      expect(p.get("empty")).toBe("");
      for (const name of ["unrelated", "disabled", "visible"])
        expect(p.has(name)).toBe(false);
      expect(p.get("username")).toBe("person");
      expect(p.get("_eventId")).toBe("submit");
      res.writeHead(303, { location: service + "&ticket=ST-test" });
      res.end();
    }
  });
  stops.push(cas.close);
  const wp = await server((req, res) => {
    if (req.url === "/wp-admin/" && !req.headers.cookie?.includes("admin=ok")) {
      res.writeHead(302, {
        location:
          cas.url +
          "/cas/login?service=" +
          encodeURIComponent(wpUrl + "/wp-admin/?callback=1"),
      });
      res.end();
    } else if (req.url!.includes("ticket=ST-test")) {
      expect(req.headers.cookie ?? "").not.toContain("cas=one");
      res.writeHead(302, {
        "set-cookie": ["wp=ok; Path=/", "admin=ok; Path=/wp-admin"],
        location: "/wp-admin/",
      });
      res.end();
    } else if (req.url!.includes("rest_route")) {
      expect(req.headers.cookie).toContain("wp=ok");
      json(res, [sample]);
    } else {
      expect(req.headers.cookie).toContain("admin=ok");
      res.end(noncePage);
    }
  });
  stops.push(wp.close);
  wpUrl = wp.url;
  const c = new CodeSnippetsClient({
    baseUrl: wp.url,
    allowInsecureHttp: true,
    auth: {
      type: "cas",
      username: "person",
      password: "secret",
      loginUrl: cas.url + "/cas/login",
    },
  });
  expect(await c.list()).toHaveLength(1);
  expect(service).toBe(wpUrl + "/wp-admin/?callback=1");
  // Also supports an explicit service without the initial WordPress redirect.
  const direct = new CodeSnippetsClient({
    baseUrl: wp.url,
    allowInsecureHttp: true,
    auth: {
      type: "cas",
      username: "person",
      password: "secret",
      loginUrl: cas.url + "/cas/login",
      serviceUrl: wpUrl + "/wp-admin/?callback=1",
    },
  });
  await direct.login();
});

it("fails safely for rejected credentials, missing nonce and MFA forms", async () => {
  let mode = 0;
  const s = await server((req, res) => {
    if (req.url === "/wp-login.php")
      res.end(
        mode === 0
          ? "<form>MFA required</form>"
          : '<form><input type="password"></form>',
      );
    else res.end("No nonce");
  });
  stops.push(s.close);
  const opts = {
    baseUrl: s.url,
    allowInsecureHttp: true,
    auth: { type: "wordpress" as const, username: "u", password: "p" },
  };
  await expect(new CodeSnippetsClient(opts).login()).rejects.toMatchObject({
    code: "AUTH",
  });
  mode = 1;
  await expect(new CodeSnippetsClient(opts).login()).rejects.toThrow("nonce");
});

it("refuses password forms targeting a different origin", async () => {
  const s = await server((req, res) =>
    res.end('<form action="https://evil.test"><input type="password"></form>'),
  );
  stops.push(s.close);
  const c = new CodeSnippetsClient({
    baseUrl: s.url,
    allowInsecureHttp: true,
    auth: { type: "wordpress", username: "u", password: "p" },
  });
  await expect(c.login()).rejects.toThrow("Cross-origin");
});

it("rejects invalid login origins and CAS entry/service origins", async () => {
  const s = await server((req, res) => res.end());
  stops.push(s.close);
  const base = { baseUrl: s.url, allowInsecureHttp: true };
  await expect(
    new CodeSnippetsClient({
      ...base,
      auth: {
        type: "wordpress",
        username: "u",
        password: "p",
        loginUrl: "https://other.test",
      },
    }).login(),
  ).rejects.toMatchObject({ code: "CONFIG" });
  for (const extra of [
    { entryUrl: "https://other.test" },
    { serviceUrl: "https://other.test" },
  ])
    await expect(
      new CodeSnippetsClient({
        ...base,
        auth: {
          type: "cas",
          username: "u",
          password: "p",
          loginUrl: s.url,
          ...extra,
        },
      }).login(),
    ).rejects.toMatchObject({ code: "CONFIG" });
});

it("limits redirects, rejects API login redirects and unexpected origins", async () => {
  const s = await server((req, res) => {
    res.writeHead(302, {
      location: req.url === "/external" ? "https://evil.test" : "/loop",
    });
    res.end();
  });
  stops.push(s.close);
  const session = new Session(new Set([s.url]), 1000, true);
  await expect(session.request(new URL("/loop", s.url))).rejects.toThrow(
    "Too many",
  );
  await expect(session.request(new URL("/external", s.url))).rejects.toThrow(
    "unconfigured",
  );
  const c = new CodeSnippetsClient({
    baseUrl: s.url,
    allowInsecureHttp: true,
    auth: { type: "session", cookie: "a=b", nonce: "nonce" },
  });
  await expect(c.get(7)).rejects.toThrow("Unexpected redirect");
});

it("does not replay POST credentials on cross-origin 307/308 redirects", async () => {
  const target = await server(() => {
    throw Error("must not arrive");
  });
  stops.push(target.close);
  const s = await server((req, res) => {
    res.writeHead(307, { location: target.url });
    res.end();
  });
  stops.push(s.close);
  const session = new Session(new Set([s.url, target.url]), 1000, true);
  await expect(
    session.request(new URL(s.url), {
      method: "POST",
      body: "password=secret",
    }),
  ).rejects.toThrow("replay");
});

it("strips authorization and explicit cookies across origins", async () => {
  const target = await server((req, res) => {
    expect(req.headers.authorization).toBeUndefined();
    expect(req.headers.cookie).toBeUndefined();
    expect(req.headers["x-wp-nonce"]).toBeUndefined();
    res.end("ok");
  });
  stops.push(target.close);
  const s = await server((req, res) => {
    res.writeHead(302, { location: target.url });
    res.end();
  });
  stops.push(s.close);
  const session = new Session(new Set([s.url, target.url]), 1000, true);
  expect(
    await (
      await session.request(new URL(s.url), {
        headers: {
          authorization: "secret",
          cookie: "wp=secret",
          "x-wp-nonce": "secret",
        },
      })
    ).text(),
  ).toBe("ok");
});

it("times out without leaking URLs or passwords", async () => {
  const s = await server(() => {});
  stops.push(s.close);
  const session = new Session(new Set([s.url]), 10, true);
  await expect(
    session.request(new URL("/?ticket=secret", s.url)),
  ).rejects.toMatchObject({
    code: "NETWORK",
    message: "Request failed or timed out",
  });
});

it("rejects a password input outside a form without posting credentials", async () => {
  let posts = 0;
  const s = await server((req, res) => {
    if (req.method === "POST") posts++;
    res.end('<div><input type="password"></div>');
  });
  stops.push(s.close);
  const client = new CodeSnippetsClient({
    baseUrl: s.url,
    allowInsecureHttp: true,
    auth: { type: "wordpress", username: "u", password: "p" },
  });
  await expect(client.get(7)).rejects.toThrow("Password form missing");
  expect(posts).toBe(0);
});
