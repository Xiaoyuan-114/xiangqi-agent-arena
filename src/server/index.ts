import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.js';
import { Room } from './room.js';

const host = process.env.XIANGQI_HOST ?? '127.0.0.1';
const port = Number(process.env.XIANGQI_PORT ?? 8787);
const webDir = process.env.XIANGQI_WEB_DIR ?? path.resolve(process.cwd(), 'dist/web');
const staticDir = fs.existsSync(path.join(webDir, 'index.html')) ? webDir : undefined;

const app = createApp(new Room(), { staticDir });
const server = app.listen(port, host, () => {
  console.error(`[xiangqi] http://${host}:${port}`);
  if (staticDir) console.error(`[xiangqi] web assets: ${staticDir}`);
});

server.on('error', (error) => {
  console.error('[xiangqi] server error', error);
  process.exitCode = 1;
});
