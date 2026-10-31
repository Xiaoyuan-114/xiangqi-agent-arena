import type { Color } from '../../shared/engine/types.js';
import type { SeatSnapshot } from '../../shared/protocol.js';
import { kindLabel, sideLabel } from '../format.js';

interface SeatCardProps {
  color: Color;
  seat: SeatSnapshot | null;
  isMe: boolean;
}

export default function SeatCard({ color, seat, isMe }: SeatCardProps) {
  const avatar = seat
    ? seat.kind === 'agent'
      ? 'AI'
      : seat.name.slice(0, 1)
    : '?';

  return (
    <article className={`seat-card seat-${color} ${seat ? 'is-filled' : 'is-empty'} ${isMe ? 'is-me' : ''}`}>
      <div className="seat-card-head">
        <span className="seat-side">
          <i />
          {sideLabel(color)}
        </span>
        {isMe && <span className="you-tag">你的座位</span>}
      </div>

      <div className={`seat-avatar ${seat?.kind === 'agent' ? 'is-agent' : ''}`}>
        <span>{avatar}</span>
      </div>

      {seat ? (
        <>
          <h3 className="seat-name">{seat.name}</h3>
          <div className="seat-meta">
            <span className={`kind-badge kind-${seat.kind}`}>{kindLabel(seat.kind)}</span>
            <span className={`ready-badge ${seat.ready ? 'is-ready' : ''}`}>
              <i />
              {seat.ready ? '已准备' : '未准备'}
            </span>
          </div>
        </>
      ) : (
        <>
          <h3 className="seat-name is-vacant">虚位以待</h3>
          <p className="seat-hint">等待一位{sideLabel(color)}棋手落座</p>
        </>
      )}
    </article>
  );
}
