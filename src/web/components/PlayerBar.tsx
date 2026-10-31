import type { Color, GameResult } from '../../shared/engine/types.js';
import type { SeatSnapshot } from '../../shared/protocol.js';
import { kindLabel, sideLabel } from '../format.js';

interface PlayerBarProps {
  color: Color;
  seat: SeatSnapshot | null;
  isMe: boolean;
  isTurn: boolean;
  result: GameResult | null;
}

export default function PlayerBar({ color, seat, isMe, isTurn, result }: PlayerBarProps) {
  const avatar = seat ? (seat.kind === 'agent' ? 'AI' : seat.name.slice(0, 1)) : '?';
  const won = result?.winner === color;

  return (
    <div className={`player-bar player-${color} ${isMe ? 'is-me' : ''} ${isTurn ? 'is-turn' : ''}`}>
      <div className={`player-avatar ${seat?.kind === 'agent' ? 'is-agent' : ''}`}>{avatar}</div>
      <div className="player-copy">
        <div className="player-name-line">
          <strong>{seat?.name ?? '空位'}</strong>
          {isMe && <span className="mini-tag">你</span>}
          {won && <span className="win-tag">胜</span>}
          {isTurn && <span className="turn-tag">行棋中</span>}
        </div>
        <div className="player-sub">
          <span className={`color-chip color-${color}`}>{sideLabel(color)}</span>
          <span>{seat ? kindLabel(seat.kind) : '虚位'}</span>
        </div>
      </div>
      <span className={`turn-indicator ${isTurn ? 'is-on' : ''}`} />
    </div>
  );
}
