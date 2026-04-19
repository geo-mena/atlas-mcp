export type GeneratorErrorCode =
    | 'INVALID_INPUT'
    | 'NO_MERGED_FACTS'
    | 'SCRATCHPAD_UNREACHABLE'
    | 'WRITE_FAILED'
    | 'INTERNAL';

export class GeneratorError extends Error {
    readonly code: GeneratorErrorCode;

    constructor(code: GeneratorErrorCode, message: string) {
        super(message);
        this.name = 'GeneratorError';
        this.code = code;
    }
}
