# Code Snippets Client

[![CI](https://github.com/erseco/code-snippets-client/actions/workflows/ci.yml/badge.svg)](https://github.com/erseco/code-snippets-client/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/erseco/code-snippets-client/branch/main/graph/badge.svg)](https://codecov.io/gh/erseco/code-snippets-client)
[![npm](https://img.shields.io/npm/v/@erseco/code-snippets-client)](https://www.npmjs.com/package/@erseco/code-snippets-client)
[![Publish](https://github.com/erseco/code-snippets-client/actions/workflows/publish.yml/badge.svg)](https://github.com/erseco/code-snippets-client/actions/workflows/publish.yml)
[![License: GPL v3 or later](https://img.shields.io/badge/License-GPLv3%2B-blue.svg)](LICENSE)

A TypeScript client and CLI for the WordPress [Code Snippets](https://wordpress.org/plugins/code-snippets/)
REST API. List, create, update, activate, deactivate and delete snippets from Node.js,
using application passwords, WordPress login, existing sessions or CAS forms.
An independent, unofficial project. Not the WPCode plugin.

[![Coverage treemap](https://codecov.io/gh/erseco/code-snippets-client/graphs/tree.svg?token=IbJ7WynHMP)](https://codecov.io/gh/erseco/code-snippets-client)

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

CI runs on Linux, Windows and macOS. WordPress integration covers PHP 8.3/8.4,
WordPress 6.9.7/7.0.4/7.1 and Code Snippets 3.9.6/3.10.2. A fixed compatibility
baseline additionally tests WordPress 6.9.5 with Code Snippets 3.9.6.

`npm run test:cas` tests Cassify 2.4.9 on that fixed baseline against the public
[pac4j CAS test server](https://www.casserverpac4j.dev), using a disposable account.
This opt-in external check is independent of required CI. Local CAS simulations
remain part of the unit tests. Neither check certifies every CAS deployment or MFA.

Copyright (C) 2026 Ernesto Serrano.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later version.
It is distributed without any warranty. See [LICENSE](LICENSE).

SPDX-License-Identifier: GPL-3.0-or-later.
