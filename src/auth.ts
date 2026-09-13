import { load } from "cheerio/slim";
import { CodeSnippetsError } from "./errors.js";
import { checkedUrl, Session } from "./session.js";
import type { Authentication } from "./types.js";

/** Submit a form on its expected origin, preserving hidden CAS fields. */
async function submitLogin(
  session: Session,
  response: Response,
  expected: URL,
  fields: Record<string, string>,
  allowHttp: boolean,
): Promise<void> {
  if (!response.ok || new URL(response.url).origin !== expected.origin)
    throw new CodeSnippetsError(
      "AUTH",
      "Login form not found on the configured origin",
    );
  const $ = load(await response.text());
  const form = $('input[type="password"]').first().closest("form");
  if (!form.length)
    throw new CodeSnippetsError(
      "AUTH",
      "Password form missing; interactive authentication may be required",
    );
  const action = checkedUrl(
    new URL(form.attr("action") || response.url, response.url).href,
    allowHttp,
  );
  if (action.origin !== expected.origin)
    throw new CodeSnippetsError("AUTH", "Cross-origin login form refused");
  const data = new URLSearchParams();
  form.find("input[name]").each((_, element) => {
    const field = $(element);
    if (field.attr("type") === "hidden" && !field.is("[disabled]"))
      data.set(field.attr("name")!, field.attr("value") ?? "");
  });
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  const result = await session.request(action, { method: "POST", body: data });
  if (!result.ok) {
    await result.body?.cancel();
    throw new CodeSnippetsError("AUTH", "Login rejected", result.status);
  }
  await result.body?.cancel();
}

export async function authenticate(
  session: Session,
  auth: Authentication,
  base: URL,
  admin: URL,
  allowHttp: boolean,
): Promise<Headers> {
  if (auth.type === "application-password") {
    return new Headers({
      authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString("base64")}`,
    });
  }
  if (auth.type === "session")
    return new Headers({ cookie: auth.cookie, "x-wp-nonce": auth.nonce });
  const adminPage = new URL("admin.php?page=add-snippet", admin);
  if (auth.type === "wordpress") {
    const login = checkedUrl(
      auth.loginUrl ?? new URL("wp-login.php", base).href,
      allowHttp,
    );
    if (login.origin !== base.origin)
      throw new CodeSnippetsError(
        "CONFIG",
        "WordPress login must use the site origin",
      );
    await submitLogin(
      session,
      await session.request(login),
      login,
      {
        log: auth.username,
        pwd: auth.password,
        "wp-submit": "Log In",
        redirect_to: adminPage.href,
        testcookie: "1",
      },
      allowHttp,
    );
  } else {
    const cas = checkedUrl(auth.loginUrl, allowHttp);
    let entry = checkedUrl(auth.entryUrl ?? admin.href, allowHttp);
    if (entry.origin !== base.origin)
      throw new CodeSnippetsError(
        "CONFIG",
        "CAS entry must use the WordPress origin",
      );
    if (auth.serviceUrl) {
      const service = checkedUrl(auth.serviceUrl, allowHttp);
      if (service.origin !== base.origin)
        throw new CodeSnippetsError(
          "CONFIG",
          "CAS service must use the WordPress origin",
        );
      cas.searchParams.set("service", service.href);
      entry = cas;
    }
    await submitLogin(
      session,
      await session.request(entry),
      cas,
      { username: auth.username, password: auth.password, _eventId: "submit" },
      allowHttp,
    );
  }
  const page = await session.request(adminPage);
  if (!page.ok || new URL(page.url).origin !== base.origin) {
    await page.body?.cancel();
    throw new CodeSnippetsError(
      "AUTH",
      "WordPress session not established",
      page.status,
    );
  }
  const html = await page.text();
  const nonce =
    /createNonceMiddleware\s*\(\s*["']([a-f0-9]{10})["']/.exec(html)?.[1] ??
    /["']nonce["']\s*:\s*["']([a-f0-9]{10})["']/.exec(html)?.[1];
  if (!nonce)
    throw new CodeSnippetsError(
      "AUTH",
      "REST nonce missing; check login and snippet permissions",
    );
  return new Headers({ "x-wp-nonce": nonce });
}
