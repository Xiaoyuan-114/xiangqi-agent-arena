import { useEffect, useState } from 'react';
import type { Color } from '../../shared/engine/types.js';
import type { RoomSnapshot, YouInfo } from '../../shared/protocol.js';
import {
  connectionLabel,
  modeLabel,
  moveText,
  resultTitle,
  sideLabel,
  statusLabel,
} from '../format.js';
import type { ConnectionState } from '../useRoom.js';
import Board from './Board.js';
import ConfirmDialog from './ConfirmDialog.js';
import MoveList from './MoveList.js';
import PlayerBar from './PlayerBar.js';
import ResultDialog from './ResultDialog.js';

interface GameViewProps {
  snapshot: RoomSnapshot;
  me: YouInfo | null;
  busy: boolean;
  connection: ConnectionState;
  onMove: (from: string, to: string) => void;
  onResign: () => void;
  onReady: (ready: boolean) => void;
  onLeave: () => void;
}

const OTHER: Record<Color, Color> = { red: 'black', black: 'red' };

export default function GameView({
  snapshot,
  me,
  busy,
  connection,
  onMove,
  onResign,
  onReady,
  onLeave,
}: GameViewProps) {
  const [dismissed, setDismissed] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'resign' | 'leave' | null>(null);
  const game = snapshot.game;

  useEffect(() => {
    if (snapshot.status !== 'finished') setDismissed(false);
  }, [snapshot.status]);

  if (!game) return null;

  const mySeat = me?.seat ?? null;
  const isSpectator = !mySeat;
  const orientation: Color = mySeat ?? 'red';
  const topColor = orientation === 'red' ? 'black' : 'red';
  const bottomColor = OTHER[topColor];
  const mySeatInfo = mySeat ? snapshot.seats[mySeat] : null;
  const myReady = Boolean(mySeatInfo?.ready);
  const myTurn = Boolean(mySeat && snapshot.status === 'playing' && game.turn === mySeat);
  const result = game.result;
  const finished = snapshot.status === 'finished' && Boolean(result);

  let banner = '';
  let tone: 'your' | 'wait' | 'check' | 'done' | 'spectate' = 'wait';
  if (finished && result) {
    banner = resultTitle(result);
    tone = 'done';
  } else if (game.inCheck) {
    banner = myTurn
      ? '将军！轮到你应将'
      : isSpectator
        ? `${sideLabel(game.turn)}被将军`
        : '你的将军奏效了';
    tone = 'check';
  } else if (isSpectator) {
    banner = `观战 · ${sideLabel(game.turn)}行棋`;
    tone = 'spectate';
  } else if (myTurn) {
    banner = '轮到你走棋';
    tone = 'your';
  } else {
    banner = '等待对方走棋';
    tone = 'wait';
  }

  const turnNumber = Math.floor(game.history.length / 2) + 1;
  const sideTag = mySeat ? `你执${sideLabel(mySeat)}` : '观战';

  const handleResign = () => {
    if (busy) return;
    setConfirmAction('resign');
  };

  const handleLeave = () => {
    if (busy) return;
    setConfirmAction('leave');
  };

  const confirmCurrentAction = () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (action === 'resign') onResign();
    if (action === 'leave') onLeave();
  };

  return (
    <main className="game-page">
      <section className="game-board-column">
        <PlayerBar
          color={topColor}
          seat={snapshot.seats[topColor]}
          isMe={mySeat === topColor}
          isTurn={!finished && game.turn === topColor}
          result={result}
        />

        <div className={`turn-strip tone-${tone}`}>
          <div className="turn-strip-main">
            <span className={`turn-orb turn-${game.turn}`} />
            <strong>{banner}</strong>
            {myTurn && <span className="live-tag">YOUR MOVE</span>}
          </div>
          <span className="turn-meta">
            第 {turnNumber} 回合 · {sideTag}
          </span>
        </div>

        <div className={`board-frame ${busy ? 'is-busy' : ''}`}>
          <Board
            game={game}
            orientation={orientation}
            myColor={mySeat}
            busy={busy}
            onMove={onMove}
          />
          {busy && <div className="board-busy">落子中…</div>}
        </div>

        <PlayerBar
          color={bottomColor}
          seat={snapshot.seats[bottomColor]}
          isMe={mySeat === bottomColor}
          isTurn={!finished && game.turn === bottomColor}
          result={result}
        />
      </section>

      <aside className="game-sidebar">
        <header className="sidebar-head">
          <p className="kicker">LIVE GAME</p>
          <h2>{modeLabel(snapshot.mode)}</h2>
          <span>{connectionLabel(connection)}</span>
        </header>

        <div className="game-stats">
          <div>
            <span>状态</span>
            <strong>{statusLabel(snapshot.status)}</strong>
          </div>
          <div>
            <span>身份</span>
            <strong>{isSpectator ? '观战' : `执${sideLabel(mySeat)}`}</strong>
          </div>
          <div>
            <span>上一手</span>
            <strong className="last-move-text">
              {game.lastMove ? moveText(game.lastMove) : '尚未落子'}
            </strong>
          </div>
        </div>

        <MoveList history={game.history} />

        <div className="game-actions">
          {snapshot.status === 'playing' && me && (
            <button className="danger-button" type="button" disabled={busy} onClick={handleResign}>
              认输
            </button>
          )}
          {finished && me && (
            <>
              <button
                className="primary-button"
                type="button"
                disabled={busy || myReady}
                onClick={() => onReady(true)}
              >
                {myReady ? '已准备，等待对手' : '再来一局'}
              </button>
              <button className="ghost-button" type="button" disabled={busy} onClick={handleLeave}>
                离席
              </button>
            </>
          )}
          {isSpectator && (
            <p className="spectator-note">观战中 · 双人/Agent 对弈正在这张棋盘上进行。</p>
          )}
        </div>
      </aside>

      {finished && result && !dismissed && (
        <ResultDialog
          result={result}
          me={me}
          myReady={myReady}
          busy={busy}
          onRematch={() => onReady(true)}
          onDismiss={() => setDismissed(true)}
        />
      )}

      {confirmAction && (
        <ConfirmDialog
          title={confirmAction === 'resign' ? '确认认输？' : '确认离席？'}
          message={
            confirmAction === 'resign'
              ? '认输后对局立即结束，由对方获胜。'
              : '离席后座位会空出，你需要重新落座才能继续对弈。'
          }
          confirmLabel={confirmAction === 'resign' ? '认输' : '离席'}
          tone="danger"
          busy={busy}
          onConfirm={confirmCurrentAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </main>
  );
}
