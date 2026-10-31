import { PIECE_LABELS } from '../shared/engine/notation.js';
import type { Color, GameResult, MoveRecord, PieceType } from '../shared/engine/types.js';
import type {
  ParticipantKind,
  RoomMode,
  RoomStatus,
} from '../shared/protocol.js';
import type { ConnectionState } from './useRoom.js';

export function sideLabel(color: Color): string {
  return color === 'red' ? '红方' : '黑方';
}

export function sideShort(color: Color): string {
  return color === 'red' ? '红' : '黑';
}

export function kindLabel(kind: ParticipantKind): string {
  return kind === 'agent' ? 'AI Agent' : '玩家';
}

export function modeLabel(mode: RoomMode): string {
  switch (mode) {
    case 'pvp':
      return '双人对战';
    case 'pve':
      return '人机对战';
    case 'eve':
      return 'AI 对战';
    default:
      return '等待对手';
  }
}

export function statusLabel(status: RoomStatus): string {
  switch (status) {
    case 'playing':
      return '对局进行中';
    case 'finished':
      return '对局结束';
    default:
      return '等待开局';
  }
}

export function connectionLabel(connection: ConnectionState): string {
  switch (connection) {
    case 'online':
      return '已连接';
    case 'reconnecting':
      return '正在重连';
    default:
      return '连接中';
  }
}

export function reasonLabel(reason: GameResult['reason'] | undefined): string {
  switch (reason) {
    case 'checkmate':
      return '将死';
    case 'stalemate':
      return '困毙';
    case 'resign':
      return '认输';
    case 'repetition':
      return '三次重复局面判和';
    default:
      return '';
  }
}

export function resultTitle(result: GameResult): string {
  if (result.winner === 'draw') return '和棋';
  return `${sideLabel(result.winner)}胜`;
}

export function moveText(record: MoveRecord): string {
  const piece = PIECE_LABELS[record.color][record.piece];
  const capture = record.captured
    ? ` 吃${PIECE_LABELS[record.color === 'red' ? 'black' : 'red'][record.captured]}`
    : '';
  const check = record.check ? ' 将军' : '';
  return `${piece} ${record.from}→${record.to}${capture}${check}`;
}

export function codeToPiece(code: string): { label: string; color: Color; type: PieceType } {
  const color: Color = code === code.toUpperCase() ? 'red' : 'black';
  const type = code.toUpperCase() as PieceType;
  return { label: PIECE_LABELS[color][type], color, type };
}

export interface HistoryRow {
  turn: number;
  red?: MoveRecord;
  black?: MoveRecord;
}

export function groupHistory(history: MoveRecord[]): HistoryRow[] {
  const rows: HistoryRow[] = [];
  history.forEach((record, index) => {
    const turn = Math.floor(index / 2) + 1;
    let row = rows[rows.length - 1];
    if (!row || row.turn !== turn) {
      row = { turn };
      rows.push(row);
    }
    if (record.color === 'red') row.red = record;
    else row.black = record;
  });
  return rows;
}
