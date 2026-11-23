---
name: wp-code-snippets
description: Read, compare and publish snippets of the WordPress Code Snippets plugin on a remote site with the wp-code-snippets CLI from @erseco/code-snippets-client. Use when asked to list, pull, diff, push, create, activate, deactivate, delete or restore a snippet on a WordPress site, to deploy a PHP file or bundle to Code Snippets, or to check what is live on the destination site.
license: GPL-3.0-or-later
compatibility: Requires Node.js 22.14 or later and the npm package @erseco/code-snippets-client installed in the project.
---

# WordPress Code Snippets from the command line

`wp-code-snippets` talks to the REST API of the Code Snippets plugin on a remote
WordPress. A snippet is PHP that runs on that site: a bad push can take it down.

`npx wp-code-snippets --help` is the authority for the installed version. If this
file and the help disagree, trust the help.

## Before the first command

1. Find how the project invokes the CLI. Many define a script such as
   `npm run snippets` that already passes `--env-file`; then use
   `npm run snippets -- <command> …`. Otherwise use
   `npx wp-code-snippets <command> … --env-file <path>`.
2. The CLI never searches for a `.env`. Without `--env-file` it only sees the
   existing environment. Ask which file to use if the project does not say.
3. Do not read, print or copy the env file: it holds credentials. Never pass a
   password, cookie or nonce as a command-line argument.
4. The destination is whatever `WP_URL` says. Confirm with the user which site
   that is before any write; do not infer it from the project name.

## Safe publishing flow

```sh
wp-code-snippets list --env-file .env                        # find the ID
wp-code-snippets diff 42 --file snippets/demo.php --env-file .env
wp-code-snippets pull 42 --output backup-42.php --env-file .env
wp-code-snippets push 42 --file snippets/demo.php --env-file .env --dry-run
# show the diff and the dry run, obtain approval in the conversation, then:
wp-code-snippets push 42 --file snippets/demo.php --env-file .env --yes
wp-code-snippets diff 42 --file snippets/demo.php --env-file .env   # equal: true
```

Add `--yes` only after the user approved that exact change on that exact site in
this conversation. An earlier approval does not cover a later write.

## Commands

| Command                         | Writes | Notes                                                   |
| ------------------------------- | ------ | ------------------------------------------------------- |
| `list`                          | no     | JSON array of every snippet                             |
| `get ID`                        | no     | JSON snippet, including `active`, `scope`, `locked`     |
| `pull ID [--output PATH]`       | no     | Raw PHP to stdout, or to a file that must not exist yet |
| `diff ID --file PATH`           | no     | JSON `{ id, equal, remote, local }`                     |
| `create --name TEXT --file …`   | yes    | Inactive unless `--enable`                              |
| `update ID` / `push ID`         | yes    | Same command; fields not supplied are preserved         |
| `activate ID` / `deactivate ID` | yes    |                                                         |
| `delete ID` / `restore ID`      | yes    | Behaviour depends on the plugin version; see below      |

Field options for `create`/`update`/`push`: `--file`, `--name`, `--scope`,
`--priority`, `--enable`, `--disable`, and `--input PATH` (a JSON object; `-`
reads stdin) for the remaining fields. Explicit options override the JSON.

Output is JSON on stdout, except `pull` without `--output`. Errors go to stderr
with a nonzero exit code and a code: `CONFIG`, `VALIDATION`, `AUTH`, `HTTP`,
`NETWORK`, `RESPONSE` or `STATE`.

## Gotchas

- **IDs are local to each site.** ID 42 on one site is a different snippet on
  another, or on another subsite. Resolve the ID with `list` against the same env
  file, matching by name. If several names could match, ask.
- **`--dry-run` does not connect.** It echoes the fields that would be sent and
  needs no `--yes`, but still requires a valid configuration. It does not check permissions, PHP syntax, the remote state or that the ID exists.
  Use `diff` to see the real difference, and lint the PHP locally (`php -l`).
- **`--file` strips only the boundary PHP tags** and normalizes CRLF. Code
  Snippets stores code without `<?php`.
- **A `NETWORK` error or a timeout on a write does not mean it was not applied.**
  Do not retry `create`, `delete` or any write blindly: run `get` or `list` first
  and decide from what is actually there. Retrying `create` makes a duplicate.
- **`single-use` snippets run once when activated.** Never activate one again to
  "fix" a result. After an explicit activation the CLI may report
  `active: false` because the snippet already ran: verify its effect on the site.
- **Locked snippets** (Code Snippets 3.10.0 and later) reject a change of `code`
  or `name` with a `STATE` error. Do not unlock on your own: report it and ask.
- **No transactions.** An update is a read followed by a write. Do not run two
  updates of the same snippet at once.
- **`push` keeps the remote activation state.** It does not activate an inactive
  snippet; use `--enable` or `activate` when the user asks for that.
- **Delete differs by version.** Code Snippets 3.10.x trashes first and
  permanently deletes a snippet that is already trashed, so a second `delete` is
  irreversible. 3.9.6 only trashes, returns `null`, and has no `restore` (404).
  A missing `trashed` or `locked` field means "unknown", not `false`.
- **Multisite:** `WP_URL` selects the site or subsite and `WP_NETWORK=true`
  selects network snippets. They are different collections with different IDs.
- **Authentication cannot be completed for the user.** MFA, CAPTCHA and
  JavaScript-driven logins are not supported. On an `AUTH` error, report it; do
  not try other credentials, other auth types or a workaround.
- **No directories, no name resolution, no Git.** The CLI publishes one file to
  one ID per invocation. Loop explicitly, and approve each destination.

## Configuration

Variables read from the env file (existing environment variables win): `WP_URL`,
`WP_AUTH` (`application-password`, `wordpress`, `cas` or `session`),
`WP_USERNAME`, `WP_PASSWORD`, `WP_NETWORK`, `WP_ADMIN_URL`, `WP_USER_AGENT`,
`WP_TIMEOUT_MS`, `CAS_LOGIN_URL`, `CAS_SERVICE_URL`, `CAS_ENTRY_URL`,
`WP_COOKIE`, `WP_NONCE`. Slow server: set `WP_TIMEOUT_MS=120000`; the default is
30000 and nothing is retried. `WP_ALLOW_HTTP=true` is for disposable local sites.

Full reference, shipped with the package:
`node_modules/@erseco/code-snippets-client/docs/api.md` and
`docs/authentication.md` in the same directory.
