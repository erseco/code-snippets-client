# Authentication

Set `baseUrl` to the complete site or subsite URL, without query parameters.
`network: true` selects network snippets. Set `adminUrl` when the administration
path differs; it must use the same origin as WordPress.
HTTPS is required unless `allowInsecureHttp: true` explicitly enables local HTTP tests.

## HTTP User-Agent

Set the top-level `userAgent` client option, or `WP_USER_AGENT` in the CLI's
explicit environment file, to send a custom HTTP User-Agent on all CAS/WordPress
login requests, redirects, nonce retrieval and REST calls. For example:

```ts
const client = new CodeSnippetsClient({
  baseUrl: "https://wordpress.example",
  auth,
  userAgent: "Mozilla/5.0",
});
```

The value must be a non-empty printable ASCII string. Omit it to retain Node's
default User-Agent. A browser-style header does not run JavaScript, unlock an
account or complete MFA/CAPTCHA; it only changes the HTTP header.

## Application passwords

```ts
const auth = {
  type: "application-password" as const,
  username: process.env.WP_USERNAME!,
  password: process.env.WP_PASSWORD!,
};
```

Use a WordPress application password, not the user's regular password. Application
passwords must be enabled, and the account needs the plugin's permissions.
[WordPress REST authentication](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/).

## WordPress login

`auth: { type: 'wordpress', username, password }` retrieves the `wp-login.php` form,
preserves cookies and obtains a nonce from the snippet administration page.
An optional `loginUrl` supports a custom login path on the same origin.
It does not run JavaScript or complete MFA, CAPTCHA or interactive SSO challenges.

## CAS / Cassify

```ts
import { CodeSnippetsClient } from "@erseco/code-snippets-client";

const client = new CodeSnippetsClient({
  baseUrl: "https://wordpress.example/subsite",
  auth: {
    type: "cas",
    username: process.env.WP_USERNAME!,
    password: process.env.WP_PASSWORD!,
    loginUrl: "https://login.example/cas/login",
  },
});
```

By default, the client opens the WordPress admin URL and follows the redirect
configured by Cassify. It preserves hidden fields, including `execution` and `lt`
when present, submits `username`, `password` and `_eventId=submit`, then follows the
service ticket back to WordPress. **WordPress/Cassify validates the ticket**; this
library is an HTTP form client, not a CAS server or service-ticket validator.

- `entryUrl`: alternate entry point on the WordPress origin. Starting at the admin
  URL keeps the CAS callback within the admin-cookie path; returning directly to
  `wp-login.php` can cause a login loop with Cassify 2.4.9.
- `serviceUrl`: when set, starts directly at `loginUrl?service=...`. Only use a
  callback accepted by your WordPress setup; some deployments need a PHP session
  initialized through WordPress first.
- No images or scripts are executed, and no additional challenges are completed.
- Forms must use the conventional field names above. Custom field names, MFA,
  dynamically generated forms and the CAS REST/TGT protocol are not supported.
- CI simulates login and callback without production credentials. It does not
  certify universal compatibility with Apereo or Cassify deployments.

Reference flow:
[WP Cassify](https://github.com/WP-Cassify/wp-cassify-develop/blob/main/wp-cassify/classes/wp_cassify_plugin.php).

## Existing sessions

`auth: { type: 'session', cookie, nonce }` accepts a session obtained externally,
including after an interactive login. These values are not persisted. The nonce
must belong to that session and the user must have the required permissions.

## Session boundaries and failures

Cookies remain in memory using `tough-cookie`. Redirects are restricted to the
configured WordPress and CAS origins. A form cannot submit a password to another
origin; cross-origin 307/308 redirects cannot replay its body either. Cookies follow
domain and path rules: different ports do not isolate cookies.

REST requests do not follow redirects to login forms. An expired session fails;
create a new client to authenticate again. Writes with uncertain outcomes are not
retried automatically. `timeoutMs` defaults to 30,000. Redirects share their request's
timeout and are limited to ten hops.

The CLI only loads an explicit `--env-file .env`. Use `WP_AUTH=cas` with
`CAS_LOGIN_URL`, `WP_USERNAME` and `WP_PASSWORD`. Existing sessions use
`WP_AUTH=session`, `WP_COOKIE` and `WP_NONCE`. Optional variables are documented in
`.env.example` and `--help`. Never pass passwords as command-line arguments.

## Tested Cassify baseline

The opt-in `npm run test:cas` check exercises WordPress 6.9.5, Code Snippets 3.9.6
and Cassify 2.4.9 against `https://www.casserverpac4j.dev`. Its endpoints are
`/login`, `/p3/serviceValidate` and `/logout`; only the public test password
`password` and a disposable username are used. These endpoint settings belong to
Cassify on the local WordPress, not to the library's REST client. See the
[development guide](development.md#public-cas-integration) for execution details.
