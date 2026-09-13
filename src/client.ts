import { authenticate } from "./auth.js";
import { CodeSnippetsError } from "./errors.js";
import { checkedUrl, Session } from "./session.js";
import type {
  ClientOptions,
  ListOptions,
  Snippet,
  SnippetInput,
} from "./types.js";

const fields = [
  "name",
  "code",
  "desc",
  "scope",
  "priority",
  "tags",
  "active",
  "shared_network",
  "condition_id",
  "locked",
] as const;
function idPath(id: number): string {
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new CodeSnippetsError(
      "VALIDATION",
      "Snippet ID must be a positive safe integer",
    );
  return String(id);
}
export function validateSnippetInput(input: Partial<SnippetInput>): void {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new CodeSnippetsError("VALIDATION", "Expected snippet fields");
  for (const [key, value] of Object.entries(input)) {
    if (!(fields as readonly string[]).includes(key))
      throw new CodeSnippetsError("VALIDATION", "Unknown snippet field");
    const valid = ["name", "code", "desc", "scope"].includes(key)
      ? typeof value === "string"
      : ["active", "shared_network", "locked"].includes(key)
        ? typeof value === "boolean"
        : key === "tags"
          ? Array.isArray(value) && value.every((v) => typeof v === "string")
          : Number.isSafeInteger(value) && Number(value) >= 0;
    if (!valid)
      throw new CodeSnippetsError("VALIDATION", "Invalid snippet field value");
  }
}
function snippet(value: unknown): Snippet {
  if (!value || typeof value !== "object")
    throw new CodeSnippetsError("RESPONSE", "Expected a snippet object");
  const s = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(s.id) ||
    Number(s.id) <= 0 ||
    typeof s.name !== "string" ||
    typeof s.code !== "string" ||
    typeof s.active !== "boolean" ||
    typeof s.scope !== "string" ||
    typeof s.desc !== "string" ||
    typeof s.network !== "boolean" ||
    typeof s.trashed !== "boolean" ||
    !Number.isSafeInteger(s.priority) ||
    !Array.isArray(s.tags) ||
    !s.tags.every((t) => typeof t === "string")
  ) {
    throw new CodeSnippetsError("RESPONSE", "Invalid snippet response");
  }
  return { ...s, code: s.code.replace(/\r\n/g, "\n") } as unknown as Snippet;
}

export class CodeSnippetsClient {
  private readonly base: URL;
  private readonly admin: URL;
  private readonly session: Session;
  private loginPromise: Promise<Headers> | undefined;
  constructor(private readonly options: ClientOptions) {
    const allowHttp = options.allowInsecureHttp ?? false;
    this.base = checkedUrl(options.baseUrl, allowHttp);
    if (this.base.search)
      throw new CodeSnippetsError(
        "CONFIG",
        "baseUrl must be a site URL without query parameters",
      );
    this.base.pathname = this.base.pathname.replace(/\/$/, "") + "/";
    this.admin = checkedUrl(
      options.adminUrl ??
        new URL(options.network ? "wp-admin/network/" : "wp-admin/", this.base)
          .href,
      allowHttp,
    );
    this.admin.pathname = this.admin.pathname.replace(/\/$/, "") + "/";
    if (this.admin.origin !== this.base.origin)
      throw new CodeSnippetsError(
        "CONFIG",
        "Admin URL must use the site origin",
      );
    const timeout = options.timeoutMs ?? 30000;
    if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 2147483647)
      throw new CodeSnippetsError("CONFIG", "Invalid timeout");
    const auth = options.auth;
    if (
      !auth ||
      !["wordpress", "cas", "application-password", "session"].includes(
        auth.type,
      )
    )
      throw new CodeSnippetsError("CONFIG", "Unsupported authentication type");
    if (
      auth.type === "session"
        ? !auth.cookie || !auth.nonce
        : !auth.username || !auth.password
    )
      throw new CodeSnippetsError(
        "CONFIG",
        "Authentication credentials are required",
      );
    const origins = new Set([this.base.origin]);
    if (auth.type === "cas")
      origins.add(checkedUrl(auth.loginUrl, allowHttp).origin);
    this.session = new Session(origins, timeout, allowHttp);
  }
  /** Initialize authentication; API methods initialize it automatically. */
  async login(): Promise<void> {
    await this.headers();
  }
  private headers(): Promise<Headers> {
    this.loginPromise ??= authenticate(
      this.session,
      this.options.auth,
      this.base,
      this.admin,
      this.options.allowInsecureHttp ?? false,
    ).catch((error) => {
      this.loginPromise = undefined;
      throw error;
    });
    return this.loginPromise;
  }
  private async request(
    path: string,
    method = "GET",
    body?: unknown,
    query: Record<string, string> = {},
  ): Promise<unknown> {
    const url = new URL(this.base);
    url.searchParams.set(
      "rest_route",
      `/code-snippets/v1/snippets${path ? "/" + path : ""}`,
    );
    url.searchParams.set("network", String(this.options.network ?? false));
    for (const [key, value] of Object.entries(query))
      url.searchParams.set(key, value);
    const headers = new Headers(await this.headers());
    headers.set("accept", "application/json");
    if (body !== undefined) headers.set("content-type", "application/json");
    const response = await this.session.request(
      url,
      {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      },
      false,
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new CodeSnippetsError(
        response.status === 401 || response.status === 403 ? "AUTH" : "HTTP",
        `WordPress request failed (HTTP ${response.status})`,
        response.status,
      );
    }
    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch {
      throw new CodeSnippetsError(
        "RESPONSE",
        "Expected JSON from WordPress; check the site URL and session",
      );
    }
  }
  /** Without explicit pagination, the plugin returns the entire collection. */
  async list(options: ListOptions = {}): Promise<Snippet[]> {
    const query: Record<string, string> = {};
    for (const [key, value] of Object.entries(options)) {
      if (key === "page" || key === "perPage") {
        if (
          !Number.isSafeInteger(value) ||
          Number(value) < 1 ||
          (key === "perPage" && Number(value) > 100)
        )
          throw new CodeSnippetsError("VALIDATION", "Invalid pagination");
        query[key === "perPage" ? "per_page" : key] = String(value);
      } else if (key === "search" && typeof value === "string")
        query.search = value;
      else if (
        key === "status" &&
        ["all", "active", "inactive"].includes(String(value))
      )
        query.status = String(value);
      else throw new CodeSnippetsError("VALIDATION", "Invalid list option");
    }
    const result = await this.request("", "GET", undefined, query);
    if (!Array.isArray(result))
      throw new CodeSnippetsError("RESPONSE", "Expected a snippet collection");
    return result.map(snippet);
  }
  async get(id: number): Promise<Snippet> {
    return snippet(await this.request(idPath(id)));
  }
  async create(input: SnippetInput): Promise<Snippet> {
    validateSnippetInput(input);
    if (!input.name?.trim() || typeof input.code !== "string")
      throw new CodeSnippetsError("VALIDATION", "A name and code are required");
    const result = snippet(
      await this.request("", "POST", {
        ...input,
        active: input.active ?? false,
        network: this.options.network ?? false,
      }),
    );
    this.checkState(
      result,
      input.active ?? false,
      input.scope === "single-use",
    );
    return result;
  }
  async update(id: number, changes: Partial<SnippetInput>): Promise<Snippet> {
    idPath(id);
    validateSnippetInput(changes);
    if (!Object.keys(changes).length)
      throw new CodeSnippetsError("VALIDATION", "No changes supplied");
    const remote = await this.get(id);
    const payload: Record<string, unknown> = {};
    for (const field of fields)
      if (remote[field] !== undefined) payload[field] = remote[field];
    Object.assign(payload, changes, { network: this.options.network ?? false });
    const singleUse =
      remote.scope === "single-use" || payload.scope === "single-use";
    if (singleUse && changes.active === undefined) delete payload.active;
    let result = snippet(await this.request(idPath(id), "POST", payload));
    // Saving code can deactivate a valid snippet through redeclaration in that request.
    // Never retry a single-use activation that may already have been consumed.
    if (
      !singleUse &&
      changes.active === undefined &&
      remote.active &&
      !result.active &&
      !result.code_error
    ) {
      result = await this.activate(id);
    }
    this.checkState(
      result,
      changes.active ?? (singleUse ? undefined : remote.active),
      singleUse,
    );
    return result;
  }
  private checkState(
    result: Snippet,
    expected?: boolean,
    singleUse = false,
  ): void {
    if (result.code_error)
      throw new CodeSnippetsError(
        "STATE",
        `WordPress reported a code error for snippet ${result.id}`,
      );
    if (
      expected !== undefined &&
      !(singleUse && expected) &&
      result.active !== expected
    )
      throw new CodeSnippetsError(
        "STATE",
        `WordPress did not preserve the requested state of snippet ${result.id}`,
      );
  }
  async activate(id: number): Promise<Snippet> {
    await this.request(`${idPath(id)}/activate`, "POST", {
      network: this.options.network ?? false,
    });
    const result = await this.get(id);
    this.checkState(result, true, result.scope === "single-use");
    return result;
  }
  async deactivate(id: number): Promise<Snippet> {
    await this.request(`${idPath(id)}/deactivate`, "POST", {
      network: this.options.network ?? false,
    });
    const result = await this.get(id);
    this.checkState(result, false);
    return result;
  }
  /** The plugin moves to trash first; deleting an already trashed snippet is permanent. */
  async delete(id: number): Promise<Snippet | null> {
    const result = await this.request(idPath(id), "DELETE");
    return result === null ? null : snippet(result);
  }
  async restore(id: number): Promise<Snippet> {
    await this.request(`${idPath(id)}/restore`, "POST", {
      network: this.options.network ?? false,
    });
    return this.get(id);
  }
}
