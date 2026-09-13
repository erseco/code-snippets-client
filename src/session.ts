import { CookieJar } from "tough-cookie";
import { CodeSnippetsError } from "./errors.js";

export function checkedUrl(value: string, allowHttp = false): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CodeSnippetsError("CONFIG", "Invalid URL");
  }
  if (
    url.username ||
    url.password ||
    url.hash ||
    !["https:", ...(allowHttp ? ["http:"] : [])].includes(url.protocol)
  ) {
    throw new CodeSnippetsError(
      "CONFIG",
      "Use HTTPS URLs without credentials or fragments",
    );
  }
  return url;
}

/** In-memory session. Redirects may only visit configured origins. */
export class Session {
  private readonly cookies = new CookieJar();
  constructor(
    private readonly origins: Set<string>,
    private readonly timeoutMs: number,
    private readonly allowHttp: boolean,
    private readonly userAgent?: string,
  ) {}

  async request(
    input: URL,
    init: RequestInit = {},
    follow = true,
  ): Promise<Response> {
    let url = input;
    let method = init.method ?? "GET";
    let body = init.body;
    const headers = new Headers(init.headers);
    if (this.userAgent !== undefined) headers.set("user-agent", this.userAgent);
    const signal = AbortSignal.timeout(this.timeoutMs);
    const explicitCookie = headers.get("cookie");
    for (let step = 0; step <= 10; step++) {
      checkedUrl(url.href, this.allowHttp);
      if (!this.origins.has(url.origin))
        throw new CodeSnippetsError(
          "AUTH",
          "Redirect to an unconfigured origin refused",
        );
      const cookie = await this.cookies.getCookieString(url.href);
      headers.delete("cookie");
      const combinedCookie = [
        cookie,
        url.origin === input.origin ? explicitCookie : null,
      ]
        .filter(Boolean)
        .join("; ");
      if (combinedCookie) headers.set("cookie", combinedCookie);
      let response: Response;
      try {
        response = await fetch(url, {
          ...init,
          method,
          body: body ?? null,
          headers,
          redirect: "manual",
          signal,
        });
      } catch {
        throw new CodeSnippetsError("NETWORK", "Request failed or timed out");
      }
      for (const value of response.headers.getSetCookie()) {
        await this.cookies.setCookie(value, url.href, { ignoreError: true });
      }
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      const location = response.headers.get("location");
      if (!follow || !location) {
        await response.body?.cancel();
        throw new CodeSnippetsError(
          "AUTH",
          "Unexpected redirect; check the session and site URL",
          response.status,
        );
      }
      const next = new URL(location, url);
      // A 307/308 must never replay a password form to another origin.
      if (next.origin !== url.origin) {
        if (
          method !== "GET" &&
          method !== "HEAD" &&
          [307, 308].includes(response.status)
        ) {
          await response.body?.cancel();
          throw new CodeSnippetsError(
            "AUTH",
            "Cross-origin credential replay refused",
          );
        }
        headers.delete("authorization");
        headers.delete("x-wp-nonce");
      }
      if (
        response.status === 303 ||
        ([301, 302].includes(response.status) && method === "POST")
      ) {
        method = "GET";
        body = null;
        headers.delete("content-type");
      }
      await response.body?.cancel();
      url = next;
    }
    throw new CodeSnippetsError("AUTH", "Too many login redirects");
  }
}
