import { useEffect, useState } from 'react';
import ConfirmDialog from './components/ConfirmDialog';
import GameView from './components/GameView';
import ReadyRoom from './components/ReadyRoom';
import TopBar from './components/TopBar';
import { connectionLabel } from './format';
import type { ConnectionState } from './useRoom';
import { useRoom } from './useRoom';

function LoadingScreen({
  connection,
  error,
  onDismissError,
}: {
  connection: ConnectionState;
  error: string | null;
  onDismissError: () => void;
}) {
  return (
    <main className="loading-page">
      <div className="loading-glow" aria-hidden="true" />
      <section className="loading-card">
        <span className="loading-seal">弈</span>
        <p className="kicker">XIANGQI · AGENT ARENA</p>
        <h1>中国象棋 · 对弈室</h1>
        <p className="loading-status">
          <i className={`connection-light connection-${connection}`} />
          {connectionLabel(connection)}…
        </p>
        {error && (
          <div className="loading-error">
            <p>{error}</p>
            <button className="text-button" type="button" onClick={onDismissError}>
              关闭提示
            </button>
          </div>
        )}
        <button className="ghost-button" type="button" onClick={() => window.location.reload()}>
          重新连接
        </button>
      </section>
    </main>
  );
}

export default function App() {
  const room = useRoom();
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const snapshot = room.snapshot;

  useEffect(() => {
    if (!room.error) return;
    const timer = setTimeout(() => room.clearError(), 7000);
    return () => clearTimeout(timer);
  }, [room.error]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      const area = document.createElement('textarea');
      area.value = window.location.href;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      } finally {
        document.body.removeChild(area);
      }
    }
  };

  const handleReset = () => {
    if (!snapshot || !room.me || room.busy) return;
    setConfirmReset(true);
  };

  if (!snapshot) {
    return (
      <LoadingScreen
        connection={room.connection}
        error={room.error}
        onDismissError={room.clearError}
      />
    );
  }

  const inGame = snapshot.status !== 'waiting';

  return (
    <div className="app-shell">
      <div className="page-texture" aria-hidden="true" />
      <TopBar
        mode={snapshot.mode}
        status={snapshot.status}
        connection={room.connection}
        seated={Boolean(room.me)}
        busy={room.busy}
        copied={copied}
        onCopy={() => void handleCopy()}
        onReset={handleReset}
      />

      <div className="app-content">
        {inGame ? (
          <GameView
            snapshot={snapshot}
            me={room.me}
            busy={room.busy}
            connection={room.connection}
            onMove={(from, to) => {
              void room.makeMove(from, to);
            }}
            onResign={() => {
              void room.resign();
            }}
            onReady={(ready) => {
              void room.setReady(ready);
            }}
            onLeave={() => {
              void room.leave();
            }}
          />
        ) : (
          <ReadyRoom
            snapshot={snapshot}
            me={room.me}
            busy={room.busy}
            onJoin={(input) => {
              void room.join(input);
            }}
            onReady={(ready) => {
              void room.setReady(ready);
            }}
            onLeave={() => {
              void room.leave();
            }}
          />
        )}
      </div>

      {room.error && (
        <div className="toast" role="alert">
          <span>{room.error}</span>
          <button type="button" onClick={room.clearError} aria-label="关闭提示">
            ×
          </button>
        </div>
      )}

      {confirmReset && snapshot && room.me && (
        <ConfirmDialog
          title="确认重置房间？"
          message={
            snapshot.status === 'playing'
              ? '重置会立即中断当前对局，清空双方座位与会话。'
              : '重置会清空当前座位与棋局，双方都需要重新加入。'
          }
          confirmLabel="重置房间"
          tone="danger"
          busy={room.busy}
          onConfirm={() => {
            setConfirmReset(false);
            void room.resetRoom();
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
}
