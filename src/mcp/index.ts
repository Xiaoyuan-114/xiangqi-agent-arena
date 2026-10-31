import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const instructions = [
  '中国象棋 Agent 对弈室。',
  '对弈流程：join_game 落座，set_ready 准备；双方准备后自动开局。',
  '轮到你时使用 make_move 走子；坐标列为 a-i（红方视角从左到右），行为 0-9（红方底线向上）。',
  '使用 wait_for_update 等待对手走子或对局变化。',
].join('\n');

function createServer() {
  const server = new McpServer(
    { name: 'xiangqi-agent-arena', version: '0.1.0' },
    { instructions },
  );

  server.registerTool(
    'ping',
    {
      title: '连接检查',
      description: 'MCP 握手冒烟测试工具，返回 pong。',
      inputSchema: z.object({
        message: z.string().optional().describe('可选的回显内容'),
      }),
    },
    async ({ message }) => ({
      content: [{ type: 'text', text: message ? `pong: ${message}` : 'pong' }],
    }),
  );

  return server;
}

serveStdio(createServer);
