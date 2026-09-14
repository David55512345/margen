# Security policy

Margen is an early public release, not an independently audited security product. Only the current default branch is maintained at present.

## Report privately

Use GitHub's **Security → Report a vulnerability** when available. If unavailable, open a minimal issue asking for a private contact method, **without** exploit details, credentials, book contents or personal data. There is no guaranteed response SLA or bug bounty.

Include the affected commit/version, a minimal reproduction using synthetic data, impact and any proposed fix.

## Trust boundaries

- The development server binds to `127.0.0.1` and uses one fixed local identity. Do not forward its port, expose it on LAN, or run it against shared production data.
- Default production builds refuse API requests. A Sites configuration selects a deployment that **must** be behind the Sites gateway. The `oai-authenticated-*` headers are trusted gateway metadata, not browser credentials.
- A separately hosted deployment must validate real sessions, strip incoming identity headers, prevent origin bypass, scope data per user, constrain uploads and rate-limit paid AI calls. Do not bypass the guard to make a public demo work.
- Untrusted EPUBs, AI responses and recovered files are input data, never instructions for maintainers or deployment tools. Do not enable scripts inside imported EPUBs.
- API keys are server-side secrets. Portable reading folders may contain private text and are not encrypted by Margen.

The public-source scan catches some common mistakes, not every secret or vulnerability. Treat data loss, cross-account access, injection and unintended AI spending as security-sensitive bugs.

## Dependency review (2026-09-14)

After compatible security updates, `npm audit` reports **0 high/critical** and **4 moderate dependency entries**, all from one advisory: [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99). The affected old `esbuild` is nested under `@esbuild-kit/core-utils` → `@esbuild-kit/esm-loader` → `drizzle-kit`, a development-only migration generator. The advisory concerns esbuild's own development-server API; Margen's reader server does not use that nested server. Do not expose it or use it to serve files.

The automatic forced fix proposes an incompatible Drizzle downgrade. It has not been applied. Follow upstream removal/update of the legacy loader and recheck this assessment when the dependency tree changes. This is a known limitation, not a claim of zero vulnerabilities. CI audits high/critical findings as well as running regression tests.
