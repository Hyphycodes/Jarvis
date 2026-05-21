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

export async function embedText(input: string): Promise<number[]> {
  const [embedding] = await embedMany([input]);
  return embedding;
}

export async function embedMany(inputs: string[]): Promise<number[][]> {
  const provider = selectedEmbeddingProvider();
  if (inputs.length === 0) return [];
  // Interface-first for this sprint. Real Voyage/OpenAI adapters plug in here.
  throw new EmbeddingProviderNotConfiguredError(provider);
}
