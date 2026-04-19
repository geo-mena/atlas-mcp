import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

import { TrafficSnifferError } from './errors.js';

export type Spawner = (
    command: string,
    args: readonly string[],
    options?: SpawnOptions,
) => ChildProcess;

export interface ProxyConfig {
    readonly runId: string;
    readonly listenPort: number;
    readonly harPath: string;
}

/**
 * Proxy — wraps a mitmdump subprocess that captures all HTTP/HTTPS traffic
 * routed through it and writes a HAR file as flows complete.
 *
 * The contract intentionally hides the difference between mitmdump dying
 * gracefully (after stop) and crashing: callers only need to know whether
 * the proxy is running and where the HAR file is being written.
 */
export class Proxy {
    private child: ChildProcess | null = null;
    private exitCode: number | null = null;

    constructor(
        private readonly config: ProxyConfig,
        private readonly spawner: Spawner = spawn as Spawner,
    ) {}

    start(): void {
        if (this.child !== null) {
            throw new TrafficSnifferError(
                'ALREADY_RUNNING',
                `proxy for run ${this.config.runId} is already running`,
            );
        }

        const args = [
            '--listen-port',
            String(this.config.listenPort),
            '--set',
            `hardump=${this.config.harPath}`,
            '--quiet',
        ];

        let process: ChildProcess;
        try {
            process = this.spawner('mitmdump', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new TrafficSnifferError(
                'MITMPROXY_NOT_FOUND',
                `failed to spawn mitmdump: ${message}`,
            );
        }

        process.on('exit', (code) => {
            this.exitCode = code ?? -1;
            this.child = null;
        });
        process.on('error', () => {
            this.child = null;
        });

        this.child = process;
    }

    stop(): void {
        if (this.child === null) return;
        this.child.kill('SIGTERM');
        this.child = null;
    }

    isRunning(): boolean {
        return this.child !== null;
    }

    lastExitCode(): number | null {
        return this.exitCode;
    }

    harPath(): string {
        return this.config.harPath;
    }

    port(): number {
        return this.config.listenPort;
    }
}
