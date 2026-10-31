import { useEffect, useState } from 'react';

type ServerStatus = 'checking' | 'online' | 'offline';

export default function App() {
  const [status, setStatus] = useState<ServerStatus>('checking');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
      .then((data) => {
        if (!cancelled) setStatus(data.ok ? 'online' : 'offline');
      })
      .catch(() => {
        if (!cancelled) setStatus('offline');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const statusLabel = {
    checking: '正在连接对局服务',
    online: '对局服务已就绪',
    offline: '对局服务未连接',
  }[status];

  return (
    <main className="shell">
      <div className="board-veil" aria-hidden="true" />
      <section className="hero">
        <p className="eyebrow">XIANGQI · AGENT ARENA</p>
        <h1 className="brand">弈</h1>
        <h2>中国象棋 · 对弈室</h2>
        <p className="subtitle">与 Agent 对坐，楚河汉界见高下。</p>
        <div className={`status status-${status}`}>
          <span className="status-dot" />
          {statusLabel}
        </div>
        <p className="note">准备室与棋盘正在搭建中。</p>
      </section>
    </main>
  );
}
