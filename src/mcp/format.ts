import { PIECE_LABELS } from '../shared/engine/notation.js';
import type { Color, GameResult, MoveRecord } from '../shared/engine/types.js';
import type { RoomSnapshot, SeatSnapshot, YouInfo } from '../shared/protocol.js';

const SIDE_LABEL: Record<Color, string> = { red: '红方', black: '黑方' };

function modeLabel(mode: RoomSnapshot['mode']): string {
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

function statusLabel(status: RoomSnapshot['status']): string {
  switch (status) {
    case 'playing':
      return '对局进行中';
    case 'finished':
      return '对局结束';
    default:
      return '等待开局';
  }
}

function seatText(seat: SeatSnapshot | null): string {
  if (!seat) return '空位';
  const kind = seat.kind === 'agent' ? 'AI Agent' : '玩家';
  return `${seat.name}（${kind}，${seat.ready ? '已准备' : '未准备'}）`;
}

function moveText(record: MoveRecord): string {
  const piece = PIECE_LABELS[record.color][record.piece];
  const captured = record.captured
    ? ` 吃${PIECE_LABELS[record.color === 'red' ? 'black' : 'red'][record.captured]}`
    : '';
  return `${piece} ${record.from}→${record.to}${captured}${record.check ? ' 将军' : ''}`;
}

function resultText(result: GameResult): string {
  const winner = result.winner === 'draw' ? '和棋' : `${SIDE_LABEL[result.winner]}胜`;
  const reasons: Record<GameResult['reason'], string> = {
    checkmate: '将死',
    stalemate: '困毙',
    resign: '认输',
    repetition: '三次重复局面判和',
  };
  return `${winner}（${reasons[result.reason]}）`;
}

function formatBoard(board: (string | null)[][]): string {
  const lines = ['    a b c d e f g h i'];
  for (let row = 9; row >= 0; row -= 1) {
    const cells = Array.from({ length: 9 }, (_, col) => board[row]?.[col] ?? '.');
    lines.push(`${row}   ${cells.join(' ')}`);
  }
  lines.push('大写红方，小写黑方；K=将/帅 A=士/仕 B=象/相 N=马 R=车 C=炮 P=兵/卒');
  return lines.join('\n');
}

function formatHistory(history: MoveRecord[]): string {
  if (history.length === 0) return '（尚无着法）';
  const recent = history.slice(-16);
  const offset = history.length - recent.length;
  const lines = recent.map((record, index) => {
    const moveNumber = Math.floor((offset + index) / 2) + 1;
    return `${moveNumber}. ${SIDE_LABEL[record.color]} ${moveText(record)}`;
  });
  if (offset > 0) lines.unshift(`（共 ${history.length} 手，以下为最近 16 手）`);
  return lines.join('\n');
}

export function formatLegalMoves(moves: string[], from?: string): string {
  const filtered = from ? moves.filter((move) => move.startsWith(from)) : moves;
  if (filtered.length === 0) {
    return from ? `从 ${from} 没有合法着法。` : '当前没有合法着法。';
  }
  const groups = new Map<string, string[]>();
  for (const move of filtered) {
    const start = move.slice(0, 2);
    const targets = groups.get(start) ?? [];
    targets.push(move);
    groups.set(start, targets);
  }
  const lines = [`合法着法（${filtered.length}）：`];
  for (const [start, targets] of groups) {
    lines.push(`${start}: ${targets.join(' ')}`);
  }
  lines.push('调用 make_move 时，from 与 to 各取 2 个字符，例如 h2e2 → from=h2，to=e2。');
  return lines.join('\n');
}

export function formatState(snapshot: RoomSnapshot, you: YouInfo | null): string {
  const lines: string[] = [
    `【棋室】${statusLabel(snapshot.status)} · ${modeLabel(snapshot.mode)} · 版本 ${snapshot.version}`,
    `红方：${seatText(snapshot.seats.red)}`,
    `黑方：${seatText(snapshot.seats.black)}`,
  ];

  if (you?.seat) {
    lines.push(`你：${SIDE_LABEL[you.seat]} · ${you.ready ? '已准备' : '未准备'}（${you.name}）`);
  } else {
    lines.push('你：尚未落座。可调用 join_game 入座。');
  }

  const game = snapshot.game;
  if (!game) {
    lines.push('');
    lines.push('当前没有进行中的对局。');
    if (you?.seat) {
      lines.push('可调用 set_ready(true) 准备；双方准备后自动开局。');
    } else {
      lines.push('调用 join_game 落座；若房间已满或对局中则无法加入。');
    }
    return lines.join('\n');
  }

  lines.push('');
  lines.push(
    `行棋方：${SIDE_LABEL[game.turn]}${game.inCheck ? '（被将军）' : ''}${game.result ? ' · 对局结束' : ''}`,
  );
  if (you?.seat && !game.result) {
    lines.push(game.turn === you.seat ? '轮到你走棋。' : '等待对方走棋。');
  }

  lines.push('');
  lines.push(`棋盘（红方在下，黑方在上）：`);
  lines.push(formatBoard(game.board));
  lines.push(`FEN：${game.fen}`);
  lines.push('');
  lines.push('最近着法：');
  lines.push(formatHistory(game.history));

  if (you?.seat && !game.result && game.turn === you.seat) {
    lines.push('');
    lines.push(formatLegalMoves(game.legalMoves));
  }

  if (game.result) {
    lines.push('');
    lines.push(`结果：${resultText(game.result)}`);
    if (you?.seat) {
      lines.push('可调用 set_ready(true) 再来一局，或调用 leave_game 离席。');
    }
  }

  return lines.join('\n');
}

export function resultSummary(result: GameResult): string {
  return resultText(result);
}

export function sideLabel(color: Color): string {
  return SIDE_LABEL[color];
}
