# Code Snippets Client

[![CI](https://github.com/erseco/code-snippets-client/actions/workflows/ci.yml/badge.svg)](https://github.com/erseco/code-snippets-client/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@erseco/code-snippets-client)](https://www.npmjs.com/package/@erseco/code-snippets-client)
[![Publish](https://github.com/erseco/code-snippets-client/actions/workflows/publish.yml/badge.svg)](https://github.com/erseco/code-snippets-client/actions/workflows/publish.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

A TypeScript client and CLI for the WordPress [Code Snippets](https://wordpress.org/plugins/code-snippets/)
REST API. List, create, update, activate, deactivate and delete snippets from Node.js,
using application passwords, WordPress login, existing sessions or CAS forms.
An independent, unofficial project. Not the WPCode plugin.

## Install

Requires **Node.js 22.14 or later**. Ships as ESM with compiled JavaScript and types.

```sh
npm install @erseco/code-snippets-client
```

```ts
import { CodeSnippetsClient } from "@erseco/code-snippets-client";

const client = new CodeSnippetsClient({
  baseUrl: "https://wordpress.example",
  auth: {
    type: "application-password",
    username: process.env.WP_USERNAME!,
    password: process.env.WP_PASSWORD!,
  },
});

const snippets = await client.list();
const snippet = await client.create({
  name: "Demo",
  code: "// PHP without <?php",
});
await client.update(snippet.id, { code: "// Updated code" });
// When you are ready to run it:
await client.activate(snippet.id);
```

New snippets are **inactive by default**. Updates preserve unspecified fields and
remote activation state. `single-use` snippets are never implicitly rearmed.
The library does not load `.env`, write backups or run Git commands.

## CLI for developers and agents

The CLI uses the same client. It only reads the explicitly selected `.env` file;
existing environment variables take precedence. No global installation needed.

```sh
npx wp-code-snippets list --env-file .env
npx wp-code-snippets diff 42 --file snippets/demo.php --env-file .env
npx wp-code-snippets push 42 --file snippets/demo.php --env-file .env --yes
npx wp-code-snippets create --name Demo --file snippets/demo.php --env-file .env --yes
```

Every write requires `--yes`; agents obtain authorization in the conversation.
`--dry-run` previews the supplied fields without connecting to WordPress. It does
not verify permissions, PHP syntax or remote conflicts. `diff` returns both code
versions and whether they match. Output is JSON except for `pull` and help.
Errors go to stderr and produce a nonzero exit code.

[API and CLI reference](docs/api.md) · [Authentication and CAS](docs/authentication.md) ·
[Architecture and limits](docs/architecture.md) · [Development and releases](docs/development.md)

## Test

```sh
npm ci
npm run check
npm run test:package
npm run test:integration  # Docker required; starts and stops disposable WordPress
```

CI runs on Linux, Windows and macOS. WordPress integration runs on Linux, pinned
to **WordPress 7.1, PHP 8.3 and Code Snippets 3.10.2**. CAS tests use a local HTTP
form/ticket/callback simulator; they do not certify every Apereo deployment or MFA.

Licensed under GPL-3.0-only. See [LICENSE](LICENSE).
