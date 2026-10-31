import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import type { JoinResponse } from '../src/shared/protocol.js';
import { createApp } from '../src/server/app.js';
import { Room } from '../src/server/room.js';

interface TestServer {
  base: string;
  room: Room;
  close: () => Promise<void>;
}

async function startServer(): Promise<TestServer> {
  const room = new Room();
  const server: Server = createApp(room).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${address.port}`,
    room,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

interface RequestOptions {
  method?: string;
  token?: string;
  body?: unknown;
}

async function call(
  base: string,
  path: string,
  options: RequestOptions = {},
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {};
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, data: await response.json() };
}

async function join(
  base: string,
  body: { kind: 'human' | 'agent'; side?: 'red' | 'black' | 'any'; name?: string; clientKey?: string },
): Promise<JoinResponse> {
  const response = await call(base, '/api/join', { method: 'POST', body });
  expect(response.status).toBe(200);
  return response.data as JoinResponse;
}

async function startGame(
  base: string,
): Promise<{ red: JoinResponse; black: JoinResponse }> {
  const red = await join(base, { kind: 'agent', side: 'red', name: 'Qoder' });
  const black = await join(base, { kind: 'human', side: 'black', name: '玩家' });
  await call(base, '/api/ready', { method: 'POST', token: red.token, body: { ready: true } });
  await call(base, '/api/ready', { method: 'POST', token: black.token, body: { ready: true } });
  return { red, black };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('HTTP API', () => {
  it('Agent 先进房准备，人类后准备自动开局', async () => {
    const server = await startServer();
    try {
      const agent = await join(server.base, {
        kind: 'agent',
        side: 'red',
        name: 'Qoder',
        clientKey: 'agent-1',
      });
      const retry = await join(server.base, {
        kind: 'agent',
        side: 'black',
        name: 'Qoder',
        clientKey: 'agent-1',
      });
      expect(retry.token).toBe(agent.token);
      expect(retry.you.seat).toBe('red');

      const ready = await call(server.base, '/api/ready', {
        method: 'POST',
        token: agent.token,
        body: { ready: true },
      });
      expect(ready.status).toBe(200);

      const human = await join(server.base, {
        kind: 'human',
        side: 'black',
        name: '玩家',
        clientKey: 'human-1',
      });
      const publicState = await call(server.base, '/api/state');
      expect(publicState.status).toBe(200);
      expect(publicState.data.seats.red.ready).toBe(true);
      expect(publicState.data.seats.black.ready).toBe(false);
      expect(publicState.data.mode).toBe('pve');

      const started = await call(server.base, '/api/ready', {
        method: 'POST',
        token: human.token,
        body: { ready: true },
      });
      expect(started.status).toBe(200);
      expect(started.data.snapshot.status).toBe('playing');
      expect(started.data.snapshot.game.turn).toBe('red');

      const me = await call(server.base, '/api/me', { token: agent.token });
      expect(me.status).toBe(200);
      expect(me.data.you.seat).toBe('red');
      expect(me.data.you.kind).toBe('agent');
    } finally {
      await server.close();
    }
  });

  it('走子、非法着法、轮次与重试幂等', async () => {
    const server = await startServer();
    try {
      const { red, black } = await startGame(server.base);

      const wrongTurn = await call(server.base, '/api/move', {
        method: 'POST',
        token: black.token,
        body: { from: 'a6', to: 'a5' },
      });
      expect(wrongTurn.status).toBe(409);
      expect(wrongTurn.data.error.code).toBe('NOT_YOUR_TURN');

      const illegal = await call(server.base, '/api/move', {
        method: 'POST',
        token: red.token,
        body: { from: 'e0', to: 'e5' },
      });
      expect(illegal.status).toBe(422);
      expect(illegal.data.error.code).toBe('ILLEGAL_MOVE');
      expect(illegal.data.error.legalMoves).toHaveLength(44);

      const moved = await call(server.base, '/api/move', {
        method: 'POST',
        token: red.token,
        body: { from: 'h2', to: 'e2', moveId: 'm1' },
      });
      expect(moved.status).toBe(200);
      expect(moved.data.record.ucci).toBe('h2e2');
      expect(moved.data.snapshot.game.history).toHaveLength(1);

      const retried = await call(server.base, '/api/move', {
        method: 'POST',
        token: red.token,
        body: { from: 'h2', to: 'e2', moveId: 'm1' },
      });
      expect(retried.status).toBe(200);
      expect(retried.data.duplicate).toBe(true);
      expect(retried.data.snapshot.game.history).toHaveLength(1);

      const reply = await call(server.base, '/api/move', {
        method: 'POST',
        token: black.token,
        body: { from: 'a6', to: 'a5' },
      });
      expect(reply.status).toBe(200);
      expect(reply.data.snapshot.game.turn).toBe('red');

      const unauthorized = await call(server.base, '/api/ready', {
        method: 'POST',
        body: { ready: true },
      });
      expect(unauthorized.status).toBe(401);
      expect(unauthorized.data.error.code).toBe('SESSION_EXPIRED');
    } finally {
      await server.close();
    }
  });

  it('长轮询在轮到自己时返回，超时正常结束', async () => {
    const server = await startServer();
    try {
      const { red, black } = await startGame(server.base);
      const state = await call(server.base, '/api/state');
      const version = state.data.version as number;

      const pending = call(
        server.base,
        `/api/wait?after=${version}&until=myTurn&timeoutMs=3000`,
        { token: black.token },
      );
      await delay(100);
      const moved = await call(server.base, '/api/move', {
        method: 'POST',
        token: red.token,
        body: { from: 'h2', to: 'e2' },
      });
      expect(moved.status).toBe(200);

      const waited = await pending;
      expect(waited.status).toBe(200);
      expect(waited.data.timedOut).toBe(false);
      expect(waited.data.snapshot.game.turn).toBe('black');

      const current = await call(server.base, '/api/state');
      const timeout = await call(
        server.base,
        `/api/wait?after=${current.data.version}&until=myTurn&timeoutMs=1000`,
        { token: red.token },
      );
      expect(timeout.status).toBe(200);
      expect(timeout.data.timedOut).toBe(true);
    } finally {
      await server.close();
    }
  }, 15_000);

  it('SSE 在落座后推送新快照', async () => {
    const server = await startServer();
    const controller = new AbortController();
    try {
      const response = await fetch(`${server.base}/api/events`, {
        signal: controller.signal,
      });
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('SSE 响应没有 body');

      const decoder = new TextDecoder();
      let buffer = '';
      const readUntil = async (predicate: (text: string) => boolean) => {
        const timer = setTimeout(() => controller.abort(), 3000);
        try {
          while (!predicate(buffer)) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
          }
        } finally {
          clearTimeout(timer);
        }
      };

      await readUntil((text) => text.includes('event: snapshot'));
      expect(buffer).toContain('"status":"waiting"');

      await join(server.base, { kind: 'agent', side: 'red', name: 'SSE Agent' });
      await readUntil((text) => text.includes('"name":"SSE Agent"'));
      expect(buffer).toContain('"version":1');
    } finally {
      controller.abort();
      await server.close();
    }
  }, 15_000);

  it('认输后重赛，重置使旧 token 失效', async () => {
    const server = await startServer();
    try {
      const { red, black } = await startGame(server.base);
      const resigned = await call(server.base, '/api/resign', {
        method: 'POST',
        token: black.token,
      });
      expect(resigned.status).toBe(200);
      expect(resigned.data.snapshot.status).toBe('finished');
      expect(resigned.data.snapshot.game.result).toEqual({ winner: 'red', reason: 'resign' });

      await call(server.base, '/api/ready', { method: 'POST', token: red.token, body: {} });
      const rematch = await call(server.base, '/api/ready', {
        method: 'POST',
        token: black.token,
        body: {},
      });
      expect(rematch.data.snapshot.status).toBe('playing');
      expect(rematch.data.snapshot.game.history).toHaveLength(0);

      const beforeReset = await call(server.base, '/api/state');
      const reset = await call(server.base, '/api/reset', {
        method: 'POST',
        token: red.token,
      });
      expect(reset.status).toBe(200);
      expect(reset.data.snapshot.status).toBe('waiting');
      expect(reset.data.snapshot.version).toBeGreaterThan(beforeReset.data.version);

      const me = await call(server.base, '/api/me', { token: red.token });
      expect(me.status).toBe(401);
      expect(me.data.error.code).toBe('SESSION_EXPIRED');
    } finally {
      await server.close();
    }
  });
});
