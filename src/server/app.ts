import express from 'express';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, name: 'xiangqi-agent-arena', version: '0.1.0' });
  });

  return app;
}
