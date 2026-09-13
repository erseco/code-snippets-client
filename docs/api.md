# API and CLI

## Library

All methods are asynchronous. `login()` initializes authentication headers or a
session. Application password validity is checked on the first REST request.
API methods initialize authentication automatically and share an in-progress login.

| Method                                        | Result                                              |
| --------------------------------------------- | --------------------------------------------------- |
| `list({ page?, perPage?, search?, status? })` | `Snippet[]`                                         |
| `get(id)`                                     | `Snippet`                                           |
| `create({ name, code, ... })`                 | `Snippet`, inactive unless `active: true`           |
| `update(id, changes)`                         | `Snippet`                                           |
| `activate(id)` / `deactivate(id)`             | `Snippet` fetched after the operation               |
| `delete(id)`                                  | Trashed snippet, or `null` after permanent deletion |
| `restore(id)`                                 | `Snippet` fetched after restoration                 |

IDs are positive integers local to each destination. Writable fields: `name`,
`code`, `desc`, `scope`, `priority`, `tags`, `active`, `shared_network`, `condition_id`
and `locked`. `network` belongs to the client configuration. Additional scopes and
fields may require a specific plugin edition.

Without explicit pagination, Code Snippets 3.10.2 returns the complete collection.
With `page`/`perPage`, only that page is returned; there is no implicit pagination
loop. `perPage` must be between 1 and 100. `status` accepts `all`, `active`, `inactive`.

`update` reads remote state and preserves known fields you did not specify. Avoid
concurrent updates of the same snippet: GET/POST is not a transaction. If saving an
active snippet deactivates it without reporting a code error, the client attempts
to restore activation once and verifies the result. When changing from/to
`single-use`, `active` is omitted unless explicitly supplied, and execution is never
retried. An explicit single-use activation may return `active: false` because the
verification read already consumed the execution; verify its application-specific effect.

`delete` follows plugin semantics: trash first, then permanently delete if already
trashed. It never retries automatically.

`CodeSnippetsError` provides `code`, `message` and an optional HTTP `status`.
Codes: `CONFIG`, `VALIDATION`, `AUTH`, `HTTP`, `NETWORK`, `RESPONSE`, `STATE`.
Errors do not include HTTP bodies, tickets, cookies or PHP source returned by the
server. A network error during a write does not prove the write was not applied.

## CLI

`wp-code-snippets --help` lists all arguments. The library accepts code as supplied;
with `--file`, the CLI normalizes CRLF and strips only boundary PHP tags.

```sh
wp-code-snippets get 42 --env-file .env
wp-code-snippets pull 42 --output backup.php --env-file .env
wp-code-snippets update 42 --input changes.json --env-file .env --yes
wp-code-snippets activate 42 --env-file .env --yes
wp-code-snippets deactivate 42 --env-file .env --yes
wp-code-snippets delete 42 --env-file .env --yes
wp-code-snippets restore 42 --env-file .env --yes
```

`--input` accepts a JSON object; `--input -` reads it from stdin, useful for Python
consumers. Explicit field arguments override JSON fields. `--output` never overwrites
an existing file. Without it, `pull` writes raw code to stdout. `push` aliases `update`
and always requires an ID.

`--dry-run` describes a write without applying it. It is not a signed plan and does
not detect remote changes. Consumers choose versions and files to publish. The CLI
does not publish entire directories, resolve ambiguous names or create Git commits.

## Python consumers

Install the npm package in the consuming project. Python can invoke
`node node_modules/@erseco/code-snippets-client/dist/bin.js` with an argument list,
parse stdout JSON and check the exit status. Pass configuration through the
environment and changes through stdin (`--input -`); never interpolate passwords
or PHP into a shell command. Each invocation keeps one session; separate invocations
authenticate again.
