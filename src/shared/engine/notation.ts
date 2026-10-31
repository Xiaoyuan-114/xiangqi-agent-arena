import type { Color, Piece, PieceType, Square } from './types.js';

export const FILES = 'abcdefghi';

export const PIECE_LABELS: Record<Color, Record<PieceType, string>> = {
  red: { K: '帅', A: '仕', B: '相', N: '马', R: '车', C: '炮', P: '兵' },
  black: { K: '将', A: '士', B: '象', N: '马', R: '车', C: '炮', P: '卒' },
};

export const PIECE_NAMES: Record<PieceType, string> = {
  K: '将帅',
  A: '士仕',
  B: '象相',
  N: '马',
  R: '车',
  C: '炮',
  P: '兵卒',
};

export function isInside(row: number, col: number): boolean {
  return row >= 0 && row < 10 && col >= 0 && col < 9;
}

export function squareToName(square: Square): string | null {
  if (!isInside(square.row, square.col)) return null;
  return `${FILES[square.col]}${square.row}`;
}

export function parseSquare(name: string): Square | null {
  if (name.length !== 2) return null;
  const col = FILES.indexOf(name[0]);
  const row = Number(name[1]);
  if (col < 0 || !Number.isInteger(row) || !isInside(row, col)) return null;
  return { row, col };
}

export function moveToUcci(from: Square, to: Square): string {
  return `${squareToName(from) ?? '??'}${squareToName(to) ?? '??'}`;
}

export function parseUcci(ucci: string): { from: Square; to: Square } | null {
  if (ucci.length !== 4) return null;
  const from = parseSquare(ucci.slice(0, 2));
  const to = parseSquare(ucci.slice(2));
  if (!from || !to) return null;
  return { from, to };
}

export function pieceCode(piece: Piece): string {
  return piece.color === 'red' ? piece.type : piece.type.toLowerCase();
}

export function colorLabel(color: Color): string {
  return color === 'red' ? '红方' : '黑方';
}
