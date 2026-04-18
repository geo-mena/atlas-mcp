export type TrafficSnifferErrorCode =
  | 'ALREADY_RUNNING'
  | 'NOT_RUNNING'
  | 'INVALID_INPUT'
  | 'MITMPROXY_NOT_FOUND'
  | 'HAR_NOT_FOUND'
  | 'HAR_PARSE_ERROR'
  | 'INTERNAL';

export class TrafficSnifferError extends Error {
  readonly code: TrafficSnifferErrorCode;

  constructor(code: TrafficSnifferErrorCode, message: string) {
    super(message);
    this.name = 'TrafficSnifferError';
    this.code = code;
  }
}
