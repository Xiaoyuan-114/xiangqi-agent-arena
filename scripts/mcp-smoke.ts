import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const serverPath = path.resolve('dist/mcp/index.js');

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  cwd: process.cwd(),
});

const client = new Client({ name: 'xiangqi-smoke', version: '0.1.0' });

try {
  await client.connect(transport);

  const { tools } = await client.listTools();
  const toolNames = tools.map((tool) => tool.name);
  console.log(`[smoke] tools: ${toolNames.join(', ')}`);

  const required = [
    'join_game',
    'set_ready',
    'get_game_state',
    'list_legal_moves',
    'make_move',
    'wait_for_update',
    'resign_game',
    'leave_game',
  ];
  const missing = required.filter((name) => !toolNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`缺少工具：${missing.join(', ')}`);
  }

  console.log('[smoke] MCP stdio handshake OK');
} finally {
  await client.close();
}
