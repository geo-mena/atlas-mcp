export type SynthesizerErrorCode =
  | 'INVALID_INPUT'
  | 'NO_FACTS'
  | 'SCRATCHPAD_UNREACHABLE'
  | 'INTERNAL';

export class SynthesizerError extends Error {
  readonly code: SynthesizerErrorCode;

  constructor(code: SynthesizerErrorCode, message: string) {
    super(message);
    this.name = 'SynthesizerError';
    this.code = code;
  }
}
