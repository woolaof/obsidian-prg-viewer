export type PrgErrorCode =
  | "NOT_ZIP"
  | "TOO_LARGE"
  | "MISSING_STAGE"
  | "MISSING_METADATA"
  | "INVALID_METADATA"
  | "INVALID_MSGPACK"
  | "INVALID_STAGE"
  | "INVALID_TAGS"
  | "INVALID_REFERENCE"
  | "BAD_REF"
  | "CIRCULAR_REF"
  | "UNSUPPORTED_VERSION";

export class PrgParseError extends Error {
  readonly code: PrgErrorCode;

  constructor(code: PrgErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PrgParseError";
    this.code = code;
  }
}
