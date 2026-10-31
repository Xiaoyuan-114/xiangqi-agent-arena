import { createApp } from './app.js';
import { Room } from './room.js';

const host = process.env.XIANGQI_HOST ?? '127.0.0.1';
const port = Number(process.env.XIANGQI_PORT ?? 8787);

const app = createApp(new Room());
const server = app.listen(port, host, () => {
  console.error(`[xiangqi] http://${host}:${port}`);
});

server.on('error', (error) => {
  console.error('[xiangqi] server error', error);
  process.exitCode = 1;
});
