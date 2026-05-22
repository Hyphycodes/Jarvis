import "server-only";

export function isQaToolsEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.ENABLE_QA_TOOLS === "true"
  );
}

export function assertQaToolsEnabled(): void {
  if (!isQaToolsEnabled()) {
    throw new Error("QA tools are disabled.");
  }
}
