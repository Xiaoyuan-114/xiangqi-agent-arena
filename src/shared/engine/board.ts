import { isInside, pieceCode } from './notation.js';
import type { Board, Color, Piece, PieceType, Square } from './types.js';

export const INITIAL_FEN =
  'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

const FEN_TO_TYPE: Record<string, PieceType> = {
  k: 'K',
  a: 'A',
  b: 'B',
  n: 'N',
  r: 'R',
  c: 'C',
  p: 'P',
};

export function emptyBoard(): Board {
  return Array.from({ length: 10 }, () => Array<Piece | null>(9).fill(null));
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
}

export function getPiece(board: Board, square: Square): Piece | null {
  if (!isInside(square.row, square.col)) return null;
  return board[square.row][square.col];
}

export function setPiece(board: Board, square: Square, piece: Piece | null): void {
  if (!isInside(square.row, square.col)) return;
  board[square.row][square.col] = piece;
}

export function findKing(board: Board, color: Color): Square | null {
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const piece = board[row][col];
      if (piece?.type === 'K' && piece.color === color) return { row, col };
    }
  }
  return null;
}

export function charToPiece(char: string): Piece | null {
  const type = FEN_TO_TYPE[char.toLowerCase()];
  if (!type) return null;
  return { type, color: char === char.toUpperCase() ? 'red' : 'black' };
}

export function parseFen(fen: string): { board: Board; turn: Color } {
  const fields = fen.trim().split(/\s+/);
  const [placement, side = 'w'] = fields;
  if (!placement) throw new Error('FEN 缺少棋盘布局');

  const ranks = placement.split('/');
  if (ranks.length !== 10) throw new Error(`FEN 应有 10 行，实际为 ${ranks.length} 行`);

  const board = emptyBoard();
  ranks.forEach((rank, index) => {
    const row = 9 - index;
    let col = 0;
    for (const char of rank) {
      if (/\d/.test(char)) {
        col += Number(char);
        continue;
      }
      if (col > 8) throw new Error(`FEN 第 ${index + 1} 行超出 9 列`);
      const piece = charToPiece(char);
      if (!piece) throw new Error(`FEN 含未知棋子字符 ${char}`);
      board[row][col] = piece;
      col += 1;
    }
    if (col !== 9) throw new Error(`FEN 第 ${index + 1} 行应为 9 列，实际为 ${col} 列`);
  });

  if (!['w', 'r', 'b'].includes(side)) throw new Error(`FEN 行棋方无效：${side}`);
  return { board, turn: side === 'b' ? 'black' : 'red' };
}

export function boardToFen(board: Board, turn: Color): string {
  const ranks: string[] = [];
  for (let row = 9; row >= 0; row -= 1) {
    let rank = '';
    let empty = 0;
    for (let col = 0; col < 9; col += 1) {
      const piece = board[row][col];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        rank += String(empty);
        empty = 0;
      }
      rank += pieceCode(piece);
    }
    if (empty > 0) rank += String(empty);
    ranks.push(rank);
  }
  return `${ranks.join('/')} ${turn === 'red' ? 'w' : 'b'} - - 0 1`;
}

export function positionKey(board: Board, turn: Color): string {
  return `${boardToFen(board, turn).split(' ').slice(0, 2).join(' ')}`;
}

export function createInitialBoard(): Board {
  return parseFen(INITIAL_FEN).board;
}
