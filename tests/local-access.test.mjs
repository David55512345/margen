import assert from "node:assert/strict";
import test from "node:test";
import { prepareReaderRequest } from "../worker/local-access.ts";

const local = { development: true, sitesHosted: false };
const production = { development: false, sitesHosted: false };

test("local mode ignores forged identities and keeps one development owner", () => {
  const result = prepareReaderRequest(new Request("http://127.0.0.1:3000/api/notes", {
    headers: { "oai-authenticated-user-id": "someone-else", "oai-authenticated-user-full-name": "Forged" },
  }), local);
  assert.ok(result instanceof Request);
  assert.equal(result.headers.get("oai-authenticated-user-id"), "margen-local-development");
  assert.equal(result.headers.get("oai-authenticated-user-full-name"), null);
});

test("local mode blocks remote hosts, origins and cross-site browser requests", () => {
  for (const request of [
    new Request("https://public.example/api/notes"),
    new Request("http://127.0.0.1:3000/api/notes", { headers: { origin: "https://evil.example" } }),
    new Request("http://127.0.0.1:3000/api/notes", { headers: { "sec-fetch-site": "cross-site" } }),
  ]) assert.equal(prepareReaderRequest(request, local).status, 403);
});

test("unconfigured production refuses APIs even with forged identity headers", () => {
  for (const path of ["/api/notes", "/api/library", "/api/vault", "/%61pi/notes", "/api/assistant", "/api/sync"]) {
    const result = prepareReaderRequest(new Request(`http://127.0.0.1:3000${path}`, {
      headers: { "oai-authenticated-user-id": "owner" },
    }), production);
    assert.equal(result.status, 503);
  }
  assert.ok(prepareReaderRequest(new Request("http://localhost/"), production) instanceof Request);
});

test("protected Sites mode requires gateway identity and same-origin writes", () => {
  const mode = { development: false, sitesHosted: true };
  assert.equal(prepareReaderRequest(new Request("https://reader.example/api/notes"), mode).status, 401);
  const headers = { "oai-authenticated-user-id": "owner", origin: "https://reader.example" };
  assert.ok(prepareReaderRequest(new Request("https://reader.example/api/notes", { method: "POST", headers }), mode) instanceof Request);
  assert.equal(prepareReaderRequest(new Request("https://reader.example/api/notes", { method: "POST", headers: { ...headers, origin: "https://other.example" } }), mode).status, 403);
});
