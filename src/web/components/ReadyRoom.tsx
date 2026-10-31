import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Color } from '../../shared/engine/types.js';
import type { RoomSnapshot, YouInfo } from '../../shared/protocol.js';
import { getStoredName } from '../api.js';
import { modeLabel, sideLabel } from '../format.js';
import type { JoinInput } from '../useRoom.js';
import ConfirmDialog from './ConfirmDialog.js';
import SeatCard from './SeatCard.js';

interface ReadyRoomProps {
  snapshot: RoomSnapshot;
  me: YouInfo | null;
  busy: boolean;
  onJoin: (input: JoinInput) => void;
  onReady: (ready: boolean) => void;
  onLeave: () => void;
}

const COLORS: Color[] = ['red', 'black'];

export default function ReadyRoom({
  snapshot,
  me,
  busy,
  onJoin,
  onReady,
  onLeave,
}: ReadyRoomProps) {
  const redSeat = snapshot.seats.red;
  const blackSeat = snapshot.seats.black;
  const redOccupied = Boolean(redSeat);
  const blackOccupied = Boolean(blackSeat);
  const bothSeated = redOccupied && blackOccupied;

  const [name, setName] = useState(() => getStoredName());
  const [side, setSide] = useState<Color>(() =>
    redSeat ? (blackSeat ? 'red' : 'black') : 'red',
  );
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    if (me) return;
    if (side === 'red' && redOccupied) {
      if (!blackOccupied) setSide('black');
    } else if (side === 'black' && blackOccupied) {
      if (!redOccupied) setSide('red');
    }
  }, [me, side, redOccupied, blackOccupied]);

  const mySeatInfo = me?.seat ? snapshot.seats[me.seat] : null;
  const myReady = Boolean(mySeatInfo?.ready);
  const bothReady = Boolean(redSeat?.ready && blackSeat?.ready);
  const canJoin = !me && (!redOccupied || !blackOccupied);

  const headline = me ? '静候落子' : bothSeated ? '虚席已满' : '虚位以待';
  const lede = me
    ? myReady
      ? bothSeated
        ? '你已准备。对手准备后，双方自动开局。'
        : '你已准备，静候另一位棋手入座。'
      : '调整好状态后点击准备；双方就绪即开新局。'
    : bothSeated
      ? bothReady
        ? '双方均已准备，正在开局。'
        : '双方已落座，静候准备就绪。'
      : 'Agent 可以先行入座准备，你再选择空位入席。';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !canJoin) return;
    onJoin({ name: name.trim() || '玩家', side });
  };

  const handleLeave = () => {
    if (busy) return;
    setConfirmLeave(true);
  };

  return (
    <main className="ready-page">
      <section className="ready-shell">
        <header className="ready-heading">
          <p className="kicker">
            READY ROOM <span>·</span> {modeLabel(snapshot.mode)}
          </p>
          <h1>{headline}</h1>
          <p className="lede">{lede}</p>
        </header>

        <div className="seat-stage">
          <SeatCard color="red" seat={redSeat} isMe={me?.seat === 'red'} />
          <div className="versus-mark" aria-hidden="true">
            <span className="versus-line" />
            <span className="versus-seal">弈</span>
            <span className="versus-line" />
            <small>对坐手谈</small>
          </div>
          <SeatCard color="black" seat={blackSeat} isMe={me?.seat === 'black'} />
        </div>

        {me && (
          <div className="my-seat-panel">
            <div>
              <p className="kicker">{me.seat ? `${sideLabel(me.seat)} · 你的座位` : '已入座'}</p>
              <h3>{myReady ? '已准备，静候对手' : '尚未准备'}</h3>
              <p className="panel-copy">
                {myReady
                  ? bothSeated
                    ? '双方准备后立即开局。'
                    : '对手落座并准备后自动开局。'
                  : '准备后等待对手；双方准备后自动开局。'}
              </p>
            </div>
            <div className="my-seat-actions">
              <button
                className={myReady ? 'ghost-button' : 'primary-button'}
                type="button"
                disabled={busy}
                onClick={() => onReady(!myReady)}
              >
                {myReady ? '取消准备' : '准备'}
              </button>
              <button
                className="text-button"
                type="button"
                disabled={busy}
                onClick={handleLeave}
              >
                离席
              </button>
            </div>
          </div>
        )}

        {canJoin && (
          <form className="join-panel" onSubmit={handleSubmit}>
            <div className="join-copy">
              <p className="kicker">JOIN THE TABLE</p>
              <h3>落座对弈</h3>
              <p>填写名字，选择空位。你可以与 Agent 对弈，也可以等待另一位玩家。</p>
            </div>

            <label className="field">
              <span>你的名字</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={24}
                placeholder="玩家"
                autoComplete="nickname"
              />
            </label>

            <div className="side-picker" role="group" aria-label="选择座位">
              {COLORS.map((color) => {
                const occupied = Boolean(snapshot.seats[color]);
                return (
                  <button
                    key={color}
                    type="button"
                    className={`side-option side-${color} ${side === color ? 'is-selected' : ''}`}
                    disabled={occupied || busy}
                    onClick={() => setSide(color)}
                  >
                    <span>{sideLabel(color)}</span>
                    <small>{occupied ? '已有棋手' : '空位'}</small>
                  </button>
                );
              })}
            </div>

            <button
              className="primary-button join-submit"
              type="submit"
              disabled={busy || (side === 'red' ? redOccupied : blackOccupied)}
            >
              入座{sideLabel(side)}
            </button>
          </form>
        )}

        {!me && !canJoin && (
          <div className="spectator-panel">
            <p className="kicker">SPECTATOR</p>
            <h3>座席已满，正在观战</h3>
            <p>
              对局双方准备后自动开局，你可以全程观看棋局。
            </p>
          </div>
        )}

        <footer className="ready-foot">
          <p>
            Agent 提示：通过 MCP 调用 <code>join_game</code> 落座，再调用{' '}
            <code>set_ready</code> 准备即可。
          </p>
          <p className="room-version">房间版本 {snapshot.version}</p>
        </footer>
      </section>

      {confirmLeave && (
        <ConfirmDialog
          title="确认离席？"
          message="离席后座位会空出，你需要重新落座才能继续对弈。"
          confirmLabel="离席"
          tone="danger"
          busy={busy}
          onConfirm={() => {
            setConfirmLeave(false);
            onLeave();
          }}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
    </main>
  );
}
