export type EmbeddingProvider = "voyage" | "openai";

export class EmbeddingProviderNotConfiguredError extends Error {
  constructor(readonly provider: EmbeddingProvider) {
    super(`${provider} embeddings are not configured for this environment.`);
    this.name = "EmbeddingProviderNotConfiguredError";
  }
}

export function selectedEmbeddingProvider(): EmbeddingProvider {
  return (process.env.EMBEDDING_PROVIDER as EmbeddingProvider) || "voyage";
}

/**
 * Whether an embedding provider is configured for this environment.
 * Gates semantic features so callers can cheaply skip the embed round-trip
 * when no provider key is present. No new required env vars — this reads the
 * provider's existing key.
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
 * Safe single-string embed. Returns the vector, or null if the input is empty,
 * the provider is not configured, or the call fails. Never throws — callers
 * rely on the null to fall back to non-semantic behavior.
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

export async function embedMany(inputs: string[]): Promise<number[][]> {
  const provider = selectedEmbeddingProvider();
  if (inputs.length === 0) return [];
  // Interface-first for this sprint. Real Voyage/OpenAI adapters plug in here.
  throw new EmbeddingProviderNotConfiguredError(provider);
}
