/**
 * Local development has one fixed identity, never a client-selected account.
 * Production identity is supplied ONLY by the protected Sites gateway.
 * An unconfigured public build exposes the shell, not the data/API endpoints.
 */
export function prepareReaderRequest(
  request: Request,
  mode: { development: boolean; sitesHosted: boolean },
): Request | Response {
  const url = new URL(request.url);
  const denied = (message: string, status = 403) => Response.json(
    { error: message }, { status, headers: { "Cache-Control": "no-store" } },
  );

  if (mode.development) {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      return denied("El modo local solo admite localhost.");
    }
    const origin = request.headers.get("origin");
    if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
      return denied("Solicitud externa bloqueada en modo local.");
    }
    const headers = new Headers(request.headers);
    for (const name of [...headers.keys()]) {
      if (name.startsWith("oai-authenticated-")) headers.delete(name);
    }
    headers.set("oai-authenticated-user-id", "margen-local-development");
    headers.set("oai-authenticated-user-email", "local@example.invalid");
    return new Request(request, { headers });
  }

  if (mode.sitesHosted) {
    // This is not standalone header authentication. Sites must terminate auth,
    // replace these headers and prevent direct access to the worker origin.
    if (!request.headers.get("oai-authenticated-user-id")) {
      return denied("Inicia sesión en el acceso protegido de Sites.", 401);
    }
    const origin = request.headers.get("origin");
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && origin && origin !== url.origin) {
      return denied("El origen de la solicitud no coincide.");
    }
    return request;
  }

  // Default distribution is development-first. Do not accidentally expose
  // single-owner fallback API routes when deploying the compiled build.
  if (["GET", "HEAD"].includes(request.method) && url.pathname === "/") return request;
  return denied("Servidor sin autenticación configurada. Consulta docs/development.md.", 503);
}
