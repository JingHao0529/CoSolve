type Message = { role: "system" | "user"; content: string };

/** Deliberately safe to show to staff; never includes upstream bodies or keys. */
export class RunpodError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "RunpodError";
    this.status = status;
  }
}

const models = new Map<string, { model: string; expires: number }>();

export function runpodConfig(env: Record<string, string | undefined> = process.env) {
  const apiKey = env.RUNPOD_API_KEY || env.COSOLVE_RUNPOD_API_KEY;
  const endpointId = env.RUNPOD_ENDPOINT_ID?.trim();
  const openaiURL = env.RUNPOD_BASE_URL?.trim() ||
    (endpointId ? `https://api.runpod.ai/v2/${encodeURIComponent(endpointId)}/openai/v1` : "");
  const baseURL = (openaiURL || env.COSOLVE_SENTIMENT_URL?.trim() || "")
    .replace(/\/+$/, "");
  if (!apiKey || !baseURL) {
    throw new RunpodError(
      "Runpod classification is not configured. Add RUNPOD_API_KEY (or COSOLVE_RUNPOD_API_KEY) and an endpoint: RUNPOD_BASE_URL, RUNPOD_ENDPOINT_ID or COSOLVE_SENTIMENT_URL. The complaint is saved and AI can be retried.",
      503,
    );
  }
  let url: URL;
  try { url = new URL(baseURL); } catch {
    throw new RunpodError("RUNPOD_BASE_URL must be a valid HTTPS OpenAI-compatible endpoint URL.", 503);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new RunpodError("RUNPOD_BASE_URL must use HTTPS without credentials or query parameters.", 503);
  }
  return {
    apiKey, baseURL, model: env.RUNPOD_MODEL?.trim(),
    custom: !openaiURL,
    serviceKey: env.COSOLVE_API_KEY,
  };
}

async function callRunpod(
  url: string,
  apiKey: string,
  body: unknown,
  transport: typeof fetch,
  serviceKey?: string,
  custom = false,
): Promise<any> {
  let response: Response;
  try {
    response = await transport(url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
        ...(serviceKey ? { "X-API-Key": serviceKey } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new RunpodError("Runpod did not respond within 90 seconds or is unavailable. Check that its worker is running, then retry.");
  }
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? custom
        ? "The custom Runpod classifier rejected authentication. Check COSOLVE_API_KEY, the service key sent as X-API-Key; it can differ from your Runpod account token."
        : "Runpod rejected the configured key. Check RUNPOD_API_KEY and its endpoint permissions."
      : response.status === 404
        ? "Runpod endpoint was not found. Check RUNPOD_BASE_URL; use the endpoint's /openai/v1 base URL, not /run or /runsync."
        : response.status === 429
          ? "Runpod is rate-limited. The complaint is saved; retry AI preparation shortly."
          : "Runpod could not classify this complaint. Check the endpoint's worker status and retry.";
    throw new RunpodError(message, response.status === 401 || response.status === 403 ? 503 : 502);
  }
  try { return await response.json(); } catch {
    throw new RunpodError("Runpod returned an unreadable response. Check that this is an OpenAI-compatible vLLM endpoint.");
  }
}

export async function requestRunpodJson<T>(
  systemPrompt: string,
  input: unknown,
  parse: (value: unknown) => T,
  options: { env?: Record<string, string | undefined>; fetch?: typeof fetch } = {},
): Promise<T> {
  const config = runpodConfig(options.env);
  const transport = options.fetch ?? fetch;
  if (config.custom) {
    const payload = input as { subject?: string; message?: string };
    const text = [payload.subject, payload.message].filter(Boolean).join("\n\n");
    const serverless = config.baseURL.endsWith("/runsync");
    const url = serverless || config.baseURL.endsWith("/analyze")
      ? config.baseURL : `${config.baseURL}/analyze`;
    const result = await callRunpod(url, config.apiKey, serverless ? { input: { text } } : { text }, transport, config.serviceKey, true);
    let output = result.output ?? result;
    if (typeof output === "string") {
      try { output = JSON.parse(output); } catch {
        throw new RunpodError("The custom Runpod endpoint did not return classification JSON.");
      }
    }
    try { return parse(output); } catch (error) {
      if (error instanceof RunpodError) throw error;
      throw new RunpodError(
        output?.sentiment && !output?.category
          ? "This Runpod endpoint returns sentiment only. Full complaint classification needs category, rootCause, urgency, confidence, sentiment and summary. Use a full classifier endpoint or a Runpod vLLM endpoint."
          : "The custom Runpod endpoint must return category, rootCause, urgency, confidence, sentiment and summary as JSON.",
      );
    }
  }
  let model = config.model;
  if (!model) {
    const cached = models.get(config.baseURL);
    model = cached && cached.expires > Date.now() ? cached.model : undefined;
    if (!model) {
      const available = await callRunpod(`${config.baseURL}/models`, config.apiKey, undefined, transport);
      model = available.data?.[0]?.id;
      if (typeof model !== "string" || !model) {
        throw new RunpodError("Runpod did not list a model. Set RUNPOD_MODEL to the model deployed on this endpoint.", 503);
      }
      models.set(config.baseURL, { model, expires: Date.now() + 300_000 });
    }
  }
  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: JSON.stringify(input) },
  ];
  const result = await callRunpod(`${config.baseURL}/chat/completions`, config.apiKey, {
    model, messages, temperature: 0.1, max_tokens: 1024,
    response_format: { type: "json_object" },
  }, transport);
  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new RunpodError("Runpod returned an empty classification. Check the deployed model and retry.");
  }
  try {
    const text = content.replace(/<think>[\s\S]*?<\/think>/g, "");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    return parse(JSON.parse(text.slice(start, end + 1)));
  } catch (error) {
    if (error instanceof RunpodError) throw error;
    throw new RunpodError("Runpod returned an invalid classification. The model must return category, rootCause, urgency, confidence, sentiment and summary as JSON.");
  }
}

export type RunpodSentiment = {
  sentiment: "Positive" | "Neutral" | "Negative";
  confidence: number;
  needsHumanReview: boolean;
  modelVersion?: string;
};

export function parseRunpodSentiment(value: unknown): RunpodSentiment {
  const data = value as Record<string, unknown> | null;
  const label = typeof data?.sentiment === "string" ? data.sentiment.toLowerCase() : "";
  if (
    !["positive", "neutral", "negative"].includes(label) ||
    typeof data?.confidence !== "number" || !Number.isFinite(data.confidence) ||
    data.confidence < 0 || data.confidence > 1 ||
    typeof data.needs_human_review !== "boolean"
  ) {
    throw new RunpodError("Runpod returned invalid sentiment analysis. Expected sentiment, confidence between 0 and 1, and needs_human_review.");
  }
  return {
    sentiment: (label[0].toUpperCase() + label.slice(1)) as RunpodSentiment["sentiment"],
    confidence: data.confidence,
    needsHumanReview: data.needs_human_review,
    ...(typeof data.model_version === "string" ? { modelVersion: data.model_version.slice(0, 128) } : {}),
  };
}

export function requestRunpodSentiment(
  input: { subject: string; message: string },
  options: { env?: Record<string, string | undefined>; fetch?: typeof fetch } = {},
): Promise<RunpodSentiment> {
  return requestRunpodJson(
    "Analyze customer sentiment. Return JSON with sentiment (positive, neutral, negative), confidence from 0 to 1, and needs_human_review (boolean). Do not make a financial decision.",
    input,
    parseRunpodSentiment,
    options,
  );
}
