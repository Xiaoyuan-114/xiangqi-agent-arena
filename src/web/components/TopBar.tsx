import type { RoomMode, RoomStatus } from '../../shared/protocol.js';
import { connectionLabel, modeLabel, statusLabel } from '../format.js';
import type { ConnectionState } from '../useRoom.js';

interface TopBarProps {
  mode: RoomMode;
  status: RoomStatus;
  connection: ConnectionState;
  seated: boolean;
  busy: boolean;
  copied: boolean;
  onCopy: () => void;
  onReset: () => void;
}

export default function TopBar({
  mode,
  status,
  connection,
  seated,
  busy,
  copied,
  onCopy,
  onReset,
}: TopBarProps) {
  return (
    <header className="topbar">
      <a className="brand-lockup" href="/" aria-label="返回中国象棋对弈室">
        <span className="brand-seal">弈</span>
        <span className="brand-words">
          <strong>中国象棋</strong>
          <small>XIANGQI · AGENT ARENA</small>
        </span>
      </a>

      <div className="topbar-center">
        <span className={`badge badge-mode mode-${mode}`}>{modeLabel(mode)}</span>
        <span className={`badge badge-status status-${status}`}>{statusLabel(status)}</span>
      </div>

      <div className="topbar-actions">
        <span className={`connection-pill connection-${connection}`}>
          <i />
          {connectionLabel(connection)}
        </span>
        <button className="ghost-button" type="button" onClick={onCopy}>
          {copied ? '已复制' : '复制邀请'}
        </button>
        {seated && (
          <button
            className="ghost-button ghost-danger"
            type="button"
            onClick={onReset}
            disabled={busy}
          >
            重置房间
          </button>
        )}
      </div>
    </header>
  );
}
