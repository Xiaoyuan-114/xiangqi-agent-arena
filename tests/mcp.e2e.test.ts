import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { Room } from '../src/server/room.js';

interface TestServer {
  base: string;
  close: () => Promise<void>;
}

interface AgentHandle {
  client: Client;
  close: () => Promise<void>;
}

async function startServer(): Promise<TestServer> {
  const server: Server = createApp(new Room()).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function agentEnv(base: string, name: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  env.XIANGQI_SERVER_URL = base;
  env.XIANGQI_AGENT_NAME = name;
  env.XIANGQI_CLIENT_KEY = `mcp-test-${name}-${randomUUID()}`;
  return env;
}

async function spawnAgent(base: string, name: string): Promise<AgentHandle> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', path.resolve('src/mcp/index.ts')],
    cwd: process.cwd(),
    env: agentEnv(base, name),
    stderr: 'inherit',
  });
  const client = new Client({ name: `xiangqi-test-${name}`, version: '0.1.0' });
  await client.connect(transport);
  return {
    client,
    close: async () => {
      await client.close();
    },
  };
}

interface ToolCallResult {
  text: string;
  isError: boolean;
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolCallResult> {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type?: string; text?: string }>)
    .filter((entry) => entry.type === 'text')
    .map((entry) => entry.text ?? '')
    .join('\n');
  return { text, isError: Boolean(result.isError) };
}

describe('MCP Agent 对弈', () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const close = cleanup.pop();
      await close?.();
    }
  });

  it('两个独立 MCP 进程完成落座、对局、认输与重赛', async () => {
    const server = await startServer();
    cleanup.push(server.close);
    const red = await spawnAgent(server.base, 'Red');
    cleanup.push(red.close);
    const black = await spawnAgent(server.base, 'Black');
    cleanup.push(black.close);

    const { tools } = await red.client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'join_game',
        'set_ready',
        'get_game_state',
        'list_legal_moves',
        'make_move',
        'wait_for_update',
        'resign_game',
        'leave_game',
      ]),
    );

    const redJoin = await call(red.client, 'join_game', { side: 'red', name: 'Red Agent' });
    expect(redJoin.isError).toBe(false);
    expect(redJoin.text).toContain('落座成功');
    expect(redJoin.text).toContain('红方');

    const redReady = await call(red.client, 'set_ready', { ready: true });
    expect(redReady.isError).toBe(false);
    expect(redReady.text).toContain('已准备');

    const blackJoin = await call(black.client, 'join_game', { side: 'black', name: 'Black Agent' });
    expect(blackJoin.isError).toBe(false);
    expect(blackJoin.text).toContain('黑方');

    const blackReady = await call(black.client, 'set_ready', { ready: true });
    expect(blackReady.isError).toBe(false);
    expect(blackReady.text).toContain('对局开始');

    const wrongTurn = await call(black.client, 'make_move', { from: 'a6', to: 'a5' });
    expect(wrongTurn.isError).toBe(true);
    expect(wrongTurn.text).toContain('红方');

    const timedOut = await call(black.client, 'wait_for_update', { timeoutMs: 1000 });
    expect(timedOut.isError).toBe(false);
    expect(timedOut.text).toContain('等待超时');

    const legal = await call(red.client, 'list_legal_moves', { from: 'h2' });
    expect(legal.isError).toBe(false);
    expect(legal.text).toContain('h2e2');

    const redMove = await call(red.client, 'make_move', { from: 'h2', to: 'e2' });
    expect(redMove.isError).toBe(false);
    expect(redMove.text).toContain('h2→e2');
    expect(redMove.text).toContain('等待对方走棋');

    const blackWait = await call(black.client, 'wait_for_update', { timeoutMs: 3000 });
    expect(blackWait.isError).toBe(false);
    expect(blackWait.text).toContain('轮到你走棋');

    const blackMove = await call(black.client, 'make_move', { from: 'a6', to: 'a5' });
    expect(blackMove.isError).toBe(false);
    expect(blackMove.text).toContain('a6→a5');

    const resign = await call(black.client, 'resign_game');
    expect(resign.isError).toBe(false);
    expect(resign.text).toContain('红方胜');
    expect(resign.text).toContain('认输');

    const redState = await call(red.client, 'get_game_state');
    expect(redState.text).toContain('红方胜');
    expect(redState.text).toContain('认输');

    const redRematch = await call(red.client, 'set_ready', { ready: true });
    expect(redRematch.text).toContain('已准备');
    const blackRematch = await call(black.client, 'set_ready', { ready: true });
    expect(blackRematch.text).toContain('对局开始');

    const leaveError = await call(black.client, 'leave_game');
    expect(leaveError.isError).toBe(true);
    expect(leaveError.text).toContain('请先认输');

    await call(black.client, 'resign_game');
    const left = await call(black.client, 'leave_game');
    expect(left.isError).toBe(false);
    expect(left.text).toContain('已离席');

    const afterLeave = await call(red.client, 'get_game_state');
    expect(afterLeave.text).toContain('空位');
  }, 45_000);
});
