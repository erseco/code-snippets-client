import { readFile, writeFile } from "node:fs/promises";
import { parseArgs, parseEnv } from "node:util";
import { CodeSnippetsClient, validateSnippetInput } from "./client.js";
import { CodeSnippetsError } from "./errors.js";
import type { Authentication, ClientOptions, SnippetInput } from "./types.js";

export const help = `wp-code-snippets <command> [id] [options]

Commands: list, get, create, update, push, pull, diff, activate, deactivate, delete, restore
Options:
  --env-file PATH    Explicit .env (never searched automatically)
  --file PATH        PHP source for create/update/push/diff
  --input PATH       JSON snippet fields for create/update (use - for stdin)
  --output PATH      Save pull output without overwriting an existing file
  --name TEXT       Snippet name for create/update
  --scope TEXT      Snippet scope
  --priority N      Execution priority
  --enable          Explicit activation on create/update
  --disable         Explicit deactivation on create/update
  --yes             Required for every remote write
  --dry-run         Return intended fields without writing
  --json            JSON output (default; pull writes raw code)
  --help            Show this help

Configuration: WP_URL, WP_AUTH=application-password|wordpress|cas|session,
WP_USERNAME, WP_PASSWORD, WP_NETWORK=true|false, WP_ADMIN_URL, WP_USER_AGENT, WP_TIMEOUT_MS,
CAS_LOGIN_URL, CAS_SERVICE_URL, CAS_ENTRY_URL, WP_COOKIE, WP_NONCE.
WP_ALLOW_HTTP=true is for disposable local tests only.
`;

function boolean(
  env: Record<string, string | undefined>,
  key: string,
): boolean {
  if (env[key] !== undefined && !["true", "false"].includes(env[key]!))
    throw new CodeSnippetsError("CONFIG", `${key} must be true or false`);
  return env[key] === "true";
}
export function clientOptions(
  env: Record<string, string | undefined>,
): ClientOptions {
  const type = env.WP_AUTH ?? "application-password";
  const credentials = {
    username: env.WP_USERNAME ?? "",
    password: env.WP_PASSWORD ?? "",
  };
  let auth: Authentication;
  if (type === "application-password" || type === "wordpress")
    auth = { type, ...credentials };
  else if (type === "session")
    auth = { type, cookie: env.WP_COOKIE ?? "", nonce: env.WP_NONCE ?? "" };
  else if (type === "cas")
    auth = {
      type,
      ...credentials,
      loginUrl: env.CAS_LOGIN_URL ?? "",
      ...(env.CAS_SERVICE_URL ? { serviceUrl: env.CAS_SERVICE_URL } : {}),
      ...(env.CAS_ENTRY_URL ? { entryUrl: env.CAS_ENTRY_URL } : {}),
    };
  else throw new CodeSnippetsError("CONFIG", "Unsupported WP_AUTH");
  return {
    baseUrl: env.WP_URL ?? "",
    auth,
    network: boolean(env, "WP_NETWORK"),
    allowInsecureHttp: boolean(env, "WP_ALLOW_HTTP"),
    ...(env.WP_TIMEOUT_MS !== undefined
      ? { timeoutMs: Number(env.WP_TIMEOUT_MS) }
      : {}),
    ...(env.WP_USER_AGENT !== undefined
      ? { userAgent: env.WP_USER_AGENT }
      : {}),
    ...(env.WP_ADMIN_URL ? { adminUrl: env.WP_ADMIN_URL } : {}),
  };
}

export function normalizePhp(code: string): string {
  return code
    .replace(/\r\n/g, "\n")
    .replace(/^\uFEFF?\s*<\?php(?:\s|$)/, "")
    .replace(/\?>\s*$/, "");
}

export async function runCli(
  args: string[],
  environment: Record<string, string | undefined> = process.env,
): Promise<unknown> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      "env-file": { type: "string" },
      file: { type: "string" },
      input: { type: "string" },
      output: { type: "string" },
      name: { type: "string" },
      scope: { type: "string" },
      priority: { type: "string" },
      enable: { type: "boolean" },
      disable: { type: "boolean" },
      yes: { type: "boolean" },
      "dry-run": { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help || !positionals.length) return help;
  const [command, idText, ...extra] = positionals;
  const commands = [
    "list",
    "get",
    "create",
    "update",
    "push",
    "pull",
    "diff",
    "activate",
    "deactivate",
    "delete",
    "restore",
  ];
  if (!commands.includes(command!) || extra.length)
    throw new CodeSnippetsError("VALIDATION", "Invalid command or arguments");
  const needsId = !["list", "create"].includes(command!);
  const id = Number(idText);
  if (needsId ? !Number.isSafeInteger(id) || id <= 0 : idText !== undefined)
    throw new CodeSnippetsError(
      "VALIDATION",
      "Provide an ID only for commands operating on an existing snippet",
    );
  const mutation = !["list", "get", "pull", "diff"].includes(command!);
  if (mutation && !values.yes && !values["dry-run"])
    throw new CodeSnippetsError(
      "VALIDATION",
      "Remote writes require --yes after reviewing the intended change",
    );
  if (values.enable && values.disable)
    throw new CodeSnippetsError(
      "VALIDATION",
      "--enable and --disable are mutually exclusive",
    );
  const writeFields = ["create", "update", "push"].includes(command!);
  if (
    !writeFields &&
    (values.input ||
      values.name ||
      values.scope ||
      values.priority ||
      values.enable ||
      values.disable)
  )
    throw new CodeSnippetsError(
      "VALIDATION",
      "Snippet fields are only valid for create/update/push",
    );
  if (values.file && !writeFields && command !== "diff")
    throw new CodeSnippetsError(
      "VALIDATION",
      "--file is only valid for create/update/push/diff",
    );
  if (values.output && command !== "pull")
    throw new CodeSnippetsError(
      "VALIDATION",
      "--output is only valid for pull",
    );
  if (values["dry-run"] && !mutation)
    throw new CodeSnippetsError(
      "VALIDATION",
      "--dry-run is only valid for remote writes",
    );
  const env = values["env-file"]
    ? {
        ...parseEnv(await readFile(values["env-file"], "utf8")),
        ...environment,
      }
    : environment;
  const client = new CodeSnippetsClient(clientOptions(env));
  let input: Partial<SnippetInput> = {};
  if (values.input) {
    let text: string;
    if (values.input === "-") {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
      text = Buffer.concat(chunks).toString("utf8");
    } else text = await readFile(values.input, "utf8");
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new CodeSnippetsError(
        "VALIDATION",
        "--input must contain a JSON object",
      );
    input = parsed as Partial<SnippetInput>;
  }
  if (values.file)
    input.code = normalizePhp(await readFile(values.file, "utf8"));
  if (values.name !== undefined) input.name = values.name;
  if (values.scope !== undefined) input.scope = values.scope;
  if (values.priority !== undefined) input.priority = Number(values.priority);
  if (values.enable || values.disable) input.active = !!values.enable;
  if (writeFields) {
    validateSnippetInput(input);
    if (
      command === "create" &&
      (!input.name?.trim() || typeof input.code !== "string")
    )
      throw new CodeSnippetsError("VALIDATION", "A name and code are required");
    if (command !== "create" && !Object.keys(input).length)
      throw new CodeSnippetsError("VALIDATION", "No changes supplied");
  }
  if (values["dry-run"])
    return {
      command,
      id: needsId ? id : undefined,
      changes: input,
      applied: false,
    };
  switch (command) {
    case "list":
      return client.list();
    case "get":
      return client.get(id);
    case "create":
      return client.create(input as SnippetInput);
    case "update":
    case "push":
      return client.update(id, input);
    case "activate":
      return client.activate(id);
    case "deactivate":
      return client.deactivate(id);
    case "delete":
      return client.delete(id);
    case "restore":
      return client.restore(id);
    case "diff": {
      if (!values.file)
        throw new CodeSnippetsError("VALIDATION", "diff requires --file");
      const remote = await client.get(id);
      return {
        id,
        equal: remote.code === input.code,
        remote: remote.code,
        local: input.code,
      };
    }
    case "pull": {
      const remote = await client.get(id);
      if (!values.output) return remote.code;
      await writeFile(values.output, remote.code, {
        encoding: "utf8",
        flag: "wx",
      });
      return { id, output: values.output };
    }
  }
}
