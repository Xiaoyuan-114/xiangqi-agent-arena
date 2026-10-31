import { useEffect } from 'react';
import type { GameResult } from '../../shared/engine/types.js';
import type { YouInfo } from '../../shared/protocol.js';
import { reasonLabel, resultTitle } from '../format.js';

interface ResultDialogProps {
  result: GameResult;
  me: YouInfo | null;
  myReady: boolean;
  busy: boolean;
  onRematch: () => void;
  onDismiss: () => void;
}

export default function ResultDialog({
  result,
  me,
  myReady,
  busy,
  onRematch,
  onDismiss,
}: ResultDialogProps) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onDismiss]);

  const seal = result.winner === 'draw' ? '和' : result.winner === 'red' ? '红' : '黑';

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <section
        className="result-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-title"
      >
        <button className="dialog-close" type="button" onClick={onDismiss} aria-label="关闭结果">
          ×
        </button>
        <div className={`result-seal result-${result.winner}`}>{seal}</div>
        <p className="kicker">FINAL POSITION</p>
        <h2 id="result-title">{resultTitle(result)}</h2>
        <p className="result-reason">{reasonLabel(result.reason)}</p>

        {me ? (
          <div className="result-rematch">
            <button
              className="primary-button"
              type="button"
              disabled={busy || myReady}
              onClick={onRematch}
            >
              {myReady ? '已准备，等待对手' : '再来一局'}
            </button>
            <p>
              {myReady
                ? '对手准备好后，将以相同座位与颜色自动开新局。'
                : '保留座位与颜色，双方重新准备即开新局。'}
            </p>
          </div>
        ) : (
          <p className="result-spectator">本局结束。你可以留在房间观看下一局。</p>
        )}

        <button className="ghost-button" type="button" onClick={onDismiss}>
          查看棋盘
        </button>
      </section>
    </div>
  );
}
