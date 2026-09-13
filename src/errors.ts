export type ErrorCode =
  "CONFIG" | "AUTH" | "HTTP" | "NETWORK" | "RESPONSE" | "VALIDATION" | "STATE";
/** Never includes HTTP bodies, cookies, passwords or ticket URLs. */
export class CodeSnippetsError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "CodeSnippetsError";
  }
}
