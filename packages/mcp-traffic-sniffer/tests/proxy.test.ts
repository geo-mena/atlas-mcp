import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';

import { TrafficSnifferError } from '../src/errors.js';
import { Proxy, type Spawner } from '../src/proxy.js';

interface SpawnCall {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: SpawnOptions | undefined;
}

function fakeChildProcess(): ChildProcess {
  const ee = new EventEmitter() as ChildProcess & { kill: (signal?: string) => boolean };
  ee.kill = () => true;
  return ee;
}

function makeSpawner(): { spawner: Spawner; calls: SpawnCall[]; lastChild: ChildProcess | null } {
  const calls: SpawnCall[] = [];
  let lastChild: ChildProcess | null = null;
  const spawner: Spawner = (command, args, options) => {
    const child = fakeChildProcess();
    lastChild = child;
    calls.push({ command, args, options });
    return child;
  };
  return {
    spawner,
    calls,
    get lastChild() {
      return lastChild;
    },
  } as unknown as { spawner: Spawner; calls: SpawnCall[]; lastChild: ChildProcess | null };
}

describe('Proxy', () => {
  it('spawns mitmdump with listen-port, hardump and quiet args', () => {
    const { spawner, calls } = makeSpawner();
    const proxy = new Proxy(
      { runId: 'run-a', listenPort: 8888, harPath: '/tmp/out.har' },
      spawner,
    );

    proxy.start();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe('mitmdump');
    expect(calls[0]?.args).toEqual([
      '--listen-port',
      '8888',
      '--set',
      'hardump=/tmp/out.har',
      '--quiet',
    ]);
    expect(proxy.isRunning()).toBe(true);
  });

  it('refuses to start twice for the same Proxy instance', () => {
    const { spawner } = makeSpawner();
    const proxy = new Proxy({ runId: 'run-a', listenPort: 8888, harPath: '/tmp/out.har' }, spawner);
    proxy.start();
    expect(() => proxy.start()).toThrowError(TrafficSnifferError);
  });

  it('stop() flips isRunning back to false', () => {
    const { spawner } = makeSpawner();
    const proxy = new Proxy({ runId: 'run-a', listenPort: 8888, harPath: '/tmp/out.har' }, spawner);
    proxy.start();
    proxy.stop();
    expect(proxy.isRunning()).toBe(false);
  });

  it('stop() on a never-started proxy is a no-op', () => {
    const proxy = new Proxy({ runId: 'run-a', listenPort: 8888, harPath: '/tmp/out.har' });
    expect(() => {
      proxy.stop();
    }).not.toThrow();
    expect(proxy.isRunning()).toBe(false);
  });

  it('exposes harPath and port for downstream tools', () => {
    const proxy = new Proxy({ runId: 'run-a', listenPort: 9000, harPath: '/tmp/x.har' });
    expect(proxy.harPath()).toBe('/tmp/x.har');
    expect(proxy.port()).toBe(9000);
  });

  it('translates spawner exceptions into MITMPROXY_NOT_FOUND', () => {
    const failingSpawner: Spawner = () => {
      throw new Error('ENOENT mitmdump');
    };
    const proxy = new Proxy({ runId: 'run-a', listenPort: 8888, harPath: '/tmp/out.har' }, failingSpawner);
    try {
      proxy.start();
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TrafficSnifferError);
      expect((err as TrafficSnifferError).code).toBe('MITMPROXY_NOT_FOUND');
    }
  });
});
