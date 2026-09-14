type ProviderRequest = {
  apiKey: string;
  model: string;
  instructions: string;
  input: string;
  schema: Record<string, unknown>;
  schemaName: string;
  maxOutputTokens: number;
  reasoning: "none" | "low";
  promptCacheKey: string;
  retryIncomplete?: boolean;
};

export type ProviderUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
};

export class OpenAIOutputError extends Error {
  readonly reason: string;
  usage: ProviderUsage;

  constructor(
    message: string,
    reason: string,
    usage: ProviderUsage,
  ) {
    super(message);
    this.name = "OpenAIOutputError";
    this.reason = reason;
    this.usage = usage;
  }
}

function addUsage(left: ProviderUsage, right: ProviderUsage): ProviderUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cachedTokens: left.cachedTokens + right.cachedTokens,
  };
}

async function callOpenAIOnce<T>(request: ProviderRequest): Promise<{ value: T; usage: ProviderUsage }> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${request.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: request.model,
      store: false,
      reasoning: { effort: request.reasoning },
      instructions: request.instructions,
      input: [{ role: "user", content: [{ type: "input_text", text: request.input }] }],
      text: {
        verbosity: "low",
        format: { type: "json_schema", name: request.schemaName, strict: true, schema: request.schema },
      },
      max_output_tokens: request.maxOutputTokens,
      prompt_cache_key: request.promptCacheKey,
      ...(request.model.startsWith("gpt-5.6") ? { prompt_cache_options: { mode: "implicit", ttl: "30m" } } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI ${response.status}: ${detail.slice(0, 400)}`);
  }

  const payload = await response.json() as {
    status?: string;
    incomplete_details?: { reason?: string } | null;
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
    };
  };
  const usage = {
    inputTokens: payload.usage?.input_tokens ?? 0,
    outputTokens: payload.usage?.output_tokens ?? 0,
    cachedTokens: payload.usage?.input_tokens_details?.cached_tokens ?? 0,
  };
  const outputText = payload.output_text
    ?? payload.output?.flatMap((item) => item.content ?? []).find((part) => part.type === "output_text")?.text;
  const incompleteReason = payload.incomplete_details?.reason;
  if (!outputText) {
    throw new OpenAIOutputError(
      `La respuesta estructurada no incluyó texto${incompleteReason ? ` (${incompleteReason})` : ""}.`,
      incompleteReason ?? (payload.status === "incomplete" ? "incomplete" : "missing_output"),
      usage,
    );
  }

  let value: T;
  try {
    value = JSON.parse(outputText) as T;
  } catch {
    throw new OpenAIOutputError(
      `La respuesta estructurada no terminó en JSON válido${incompleteReason ? ` (${incompleteReason})` : ""}.`,
      incompleteReason ?? "invalid_json",
      usage,
    );
  }

  return {
    value,
    usage,
  };
}

export async function callOpenAI<T>(request: ProviderRequest): Promise<{ value: T; usage: ProviderUsage }> {
  try {
    return await callOpenAIOnce<T>(request);
  } catch (error) {
    if (!request.retryIncomplete || !(error instanceof OpenAIOutputError)) throw error;

    // `max_output_tokens` incluye tanto el JSON visible como los tokens de
    // razonamiento. El reintento reserva espacio al JSON y ocurre una sola vez.
    try {
      const retried = await callOpenAIOnce<T>({
        ...request,
        reasoning: "none",
        maxOutputTokens: Math.max(640, request.maxOutputTokens * 2),
        retryIncomplete: false,
      });
      return { value: retried.value, usage: addUsage(error.usage, retried.usage) };
    } catch (retryError) {
      if (retryError instanceof OpenAIOutputError) {
        retryError.usage = addUsage(error.usage, retryError.usage);
      }
      throw retryError;
    }
  }
}
