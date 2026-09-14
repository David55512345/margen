# Contributing to Margen

English and Spanish reports are welcome. Check existing issues and discuss larger architecture/storage changes before implementing them.

## Making a change

1. Follow the [local setup](README.md#run-locally) and generate an original sample with `npm run demo:epub`.
2. Keep each pull request focused; describe the problem and what changed.
3. Add a regression test. Run `npm test` and `npm run check:public`.
4. State which checks were actually run, including browser, layout and theme for UI changes.

Preserve reading position, saved references, existing user data and voice controls unless the change explicitly concerns them. Storage changes need migrations and recovery/owner-isolation tests; do not casually regenerate old migrations. AI actions must be user-requested, grounded in available context and safe to cancel. A regular question must not silently create a saved note.

For EPUB changes test Page and Scroll, opening/closing sidebars, selection, note editing and reopening the book. For UI changes check keyboard access, narrow screens and light/dark themes.

`npm run lint` currently reports legacy findings. Do not hide them by disabling rules wholesale. Keep `.dev.vars`, `.env*`, `.wrangler`, private `.openai` configuration and reading folders out of Git.

## Reports and review

Do not upload commercial EPUBs, private annotations, account exports, database dumps, tokens or API keys. For security issues follow [SECURITY.md](SECURITY.md).

The maintainer reviews contributions; passing CI alone is not a security or correctness guarantee. Authentication, AI billing and file replacement deserve extra review. No release schedule or support response time is promised.

AI-assisted contributions are welcome: understand the change, verify behavior and disclose relevant testing limitations. Do not submit generated issue spam, incompatible copied code, fabricated benchmarks or invented usage claims.

By contributing original code, you agree to make it available under the project's MIT license. Respect the licenses of dependencies and third-party material.
