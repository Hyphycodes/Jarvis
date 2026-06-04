import "server-only";

export type EmbeddingProvider = "voyage" | "openai";

export class EmbeddingProviderNotConfiguredError extends Error {
  constructor(readonly provider: EmbeddingProvider) {
    super(`${provider} embeddings are not configured for this environment.`);
    this.name = "EmbeddingProviderNotConfiguredError";
  }
}

// Default is "openai" so OPENAI_API_KEY (already in the project for the
// Realtime voice route) activates embeddings without any new env vars.
// Set EMBEDDING_PROVIDER=voyage to opt into Voyage when that adapter ships.
export function selectedEmbeddingProvider(): EmbeddingProvider {
  return (process.env.EMBEDDING_PROVIDER as EmbeddingProvider) || "openai";
}

/**
 * Whether an embedding provider is configured for this environment.
 * Callers probe this before doing any embed work so the round-trip is skipped
 * entirely when no key is present. No new required env vars.
 */
export function hasEmbeddings(): boolean {
  return selectedEmbeddingProvider() === "openai"
    ? Boolean(process.env.OPENAI_API_KEY)
    : Boolean(process.env.VOYAGE_API_KEY);
}

export async function embedText(input: string): Promise<number[]> {
  const [embedding] = await embedMany([input]);
  return embedding;
}

/**
 * Safe single-string embed. Returns the vector, or null when the input is
 * empty, the provider is not configured, or the API call fails. Never throws
 * — callers rely on the null to fall back to non-semantic behavior.
 */
export async function embedOne(input: string): Promise<number[] | null> {
  const text = input.trim();
  if (!text) return null;
  try {
    const embedding = await embedText(text);
    return Array.isArray(embedding) && embedding.length > 0 ? embedding : null;
  } catch (err) {
    if (!(err instanceof EmbeddingProviderNotConfiguredError)) {
      console.error("[embeddings] embedOne failed", err);
    }
    return null;
  }
}

/**
 * Embed multiple strings in a single API call.
 *
 * OpenAI text-embedding-3-small produces 1536-d vectors.
 * Results are returned in the same order as `inputs`.
 * Throws on API failure — embedOne's try/catch catches it and returns null.
 */
export async function embedMany(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];

  const provider = selectedEmbeddingProvider();

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new EmbeddingProviderNotConfiguredError("openai");

    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: inputs,
        encoding_format: "float",
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI embeddings API error ${res.status}: ${body}`);
    }

    const json = (await res.json()) as {
      data: Array<{ index: number; embedding: number[] }>;
    };

    // Sort by index to guarantee input-order alignment.
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    return sorted.map((d) => d.embedding);
  }

  // Voyage adapter: not yet implemented.
  throw new EmbeddingProviderNotConfiguredError(provider);
}
