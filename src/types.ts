/** Writable Code Snippets fields. IDs belong to the destination site. */
export interface SnippetInput {
  name: string;
  code: string;
  desc?: string;
  scope?: string;
  priority?: number;
  tags?: string[];
  active?: boolean;
  shared_network?: boolean;
  condition_id?: number;
  locked?: boolean;
}
export interface Snippet extends SnippetInput {
  id: number;
  desc: string;
  scope: string;
  priority: number;
  tags: string[];
  active: boolean;
  network: boolean;
  /** Absent in older plugin APIs, including 3.9.6; absence does not mean false. */
  trashed?: boolean;
  /** Locking exists from 3.10.0; 3.9.6 omits it and has no locking at all. */
  locked?: boolean;
  code_error?: unknown;
}
export type Authentication =
  | { type: "application-password"; username: string; password: string }
  | { type: "wordpress"; username: string; password: string; loginUrl?: string }
  | {
      type: "cas";
      username: string;
      password: string;
      loginUrl: string;
      serviceUrl?: string;
      entryUrl?: string;
    }
  | { type: "session"; cookie: string; nonce: string };
export interface ClientOptions {
  baseUrl: string;
  auth: Authentication;
  network?: boolean;
  adminUrl?: string;
  timeoutMs?: number;
  /** Optional HTTP User-Agent sent on login, redirects and REST requests. */
  userAgent?: string;
  /** Explicit HTTP opt-in for disposable local environments. */
  allowInsecureHttp?: boolean;
}
export interface ListOptions {
  page?: number;
  perPage?: number;
  search?: string;
  status?: "all" | "active" | "inactive";
}
