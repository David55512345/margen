import { getRecentAIUsage, requestOwnerKey } from "../../ai/repository";

export async function GET(request: Request) {
  const events = await getRecentAIUsage(requestOwnerKey(request), 200);
  const byTask = Object.values(events.reduce<Record<string, {
    task: string; calls: number; cacheHits: number; inputTokens: number; outputTokens: number;
    cachedTokens: number; estimatedInputTokens: number; durationMs: number;
  }>>((result, event) => {
    const current = result[event.task] ?? {
      task: event.task, calls: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0,
      cachedTokens: 0, estimatedInputTokens: 0, durationMs: 0,
    };
    current.calls += 1;
    current.cacheHits += event.cacheHit ? 1 : 0;
    current.inputTokens += event.inputTokens;
    current.outputTokens += event.outputTokens;
    current.cachedTokens += event.cachedTokens;
    current.estimatedInputTokens += event.estimatedInputTokens;
    current.durationMs += event.durationMs;
    result[event.task] = current;
    return result;
  }, {}));
  return Response.json({ byTask, recent: events });
}
