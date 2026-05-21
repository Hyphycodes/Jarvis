import { DEFAULT_MODEL, getAnthropicClient } from "@/lib/ai/anthropic";

export class StructuredGenerationError extends Error {
  constructor(
    message: string,
    readonly rawText: string,
    readonly schemaName: string,
  ) {
    super(message);
    this.name = "StructuredGenerationError";
  }
}

export async function generateStructured<T>({
  system,
  prompt,
  schemaName,
  temperature = 0.2,
}: {
  system: string;
  prompt: string;
  schemaName: string;
  temperature?: number;
}): Promise<T> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    temperature,
    system,
    messages: [
      {
        role: "user",
        content: `${prompt}\n\nReturn valid JSON only for schema: ${schemaName}.`,
      },
    ],
  });

  const rawText = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();

  try {
    return JSON.parse(stripJsonFence(rawText)) as T;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown JSON parse error";
    throw new StructuredGenerationError(
      `Claude returned invalid JSON for ${schemaName}: ${message}`,
      rawText,
      schemaName,
    );
  }
}

function stripJsonFence(value: string) {
  return value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
