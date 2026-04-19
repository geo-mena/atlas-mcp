export type AuditorErrorCode =
  | 'INVALID_INPUT'
  | 'NO_SCENARIOS'
  | 'SCRATCHPAD_UNREACHABLE'
  | 'WRITE_FAILED'
  | 'NORMALIZATION_FAILED'
  | 'INTERNAL';

export class AuditorError extends Error {
  readonly code: AuditorErrorCode;

  constructor(code: AuditorErrorCode, message: string) {
    super(message);
    this.name = 'AuditorError';
    this.code = code;
  }
}
