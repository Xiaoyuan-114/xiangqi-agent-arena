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
  if (!toolNames.includes('ping')) {
    throw new Error('ping 工具未注册');
  }

  const result = await client.callTool({ name: 'ping', arguments: { message: 'hello' } });
  console.log(`[smoke] result: ${JSON.stringify(result.content)}`);
  if (!JSON.stringify(result.content).includes('pong: hello')) {
    throw new Error('ping 返回内容不符合预期');
  }

  console.log('[smoke] MCP stdio handshake OK');
} finally {
  await client.close();
}
