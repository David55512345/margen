import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

// Print paths/categories, never matching secret values.
const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
if (!paths.length) throw new Error("No tracked files to audit. Stage the intended public files first.");
const forbidden = /(^|\/)(\.openai|\.wrangler|node_modules|libros|backups|\.claude|\.codex)(\/|$)|(^|\/)(\.env(?!\.example$)|\.dev\.vars)|\.(epub|sqlite\d*|db|pem|p12|pfx|key|zip|tar\.gz)$/i;
const checks = [
  ["API credential", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}\b/],
  ["GitHub credential", /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["private deployment identifier", /\b(?:appgprj|appgver|appgdep)_[a-f0-9]{24,}\b/],
];
let failures = 0;
for (const path of paths) {
  if (forbidden.test(path)) { console.error(`Forbidden public artifact: ${path}`); failures++; }
  if (/\.(png|ico|jpg|jpeg|webp|woff2?)$/i.test(path)) continue;
  const content = await readFile(path, "utf8");
  for (const [category, pattern] of checks) {
    if (pattern.test(content)) { console.error(`${category}: ${path}`); failures++; }
  }
}
if (failures) process.exitCode = 1;
else console.log(`Checked ${paths.length} tracked files; no configured public-source violations found.`);
