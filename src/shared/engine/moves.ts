import { cloneBoard, findKing } from './board.js';
import { isInside } from './notation.js';
import type { Board, Color, Move, Piece, Square } from './types.js';
import { opposite, sameSquare } from './types.js';

const ORTHOGONAL = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

const DIAGONAL = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

const HORSE_OFFSETS = [
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1],
  [1, 2],
  [1, -2],
  [-1, 2],
  [-1, -2],
] as const;

const ELEPHANT_OFFSETS = [
  [2, 2],
  [2, -2],
  [-2, 2],
  [-2, -2],
] as const;

function inPalace(color: Color, row: number, col: number): boolean {
  if (col < 3 || col > 5) return false;
  return color === 'red' ? row >= 0 && row <= 2 : row >= 7 && row <= 9;
}

function onOwnSide(color: Color, row: number): boolean {
  return color === 'red' ? row <= 4 : row >= 5;
}

function addMove(
  board: Board,
  from: Square,
  piece: Piece,
  row: number,
  col: number,
  moves: Move[],
): boolean {
  if (!isInside(row, col)) return false;
  const target = board[row][col];
  if (target?.color === piece.color) return false;
  moves.push({ from, to: { row, col }, piece, captured: target });
  return true;
}

export function generatePseudoMovesForPiece(board: Board, from: Square): Move[] {
  const piece = board[from.row]?.[from.col];
  if (!piece) return [];
  const moves: Move[] = [];

  switch (piece.type) {
    case 'R': {
      for (const [dr, dc] of ORTHOGONAL) {
        let row = from.row + dr;
        let col = from.col + dc;
        while (isInside(row, col)) {
          const target = board[row][col];
          if (target?.color === piece.color) break;
          moves.push({ from, to: { row, col }, piece, captured: target });
          if (target) break;
          row += dr;
          col += dc;
        }
      }
      break;
    }
    case 'C': {
      for (const [dr, dc] of ORTHOGONAL) {
        let row = from.row + dr;
        let col = from.col + dc;
        let screenFound = false;
        while (isInside(row, col)) {
          const target = board[row][col];
          if (!screenFound) {
            if (target) {
              screenFound = true;
            } else {
              moves.push({ from, to: { row, col }, piece, captured: null });
            }
          } else if (target) {
            if (target.color !== piece.color) {
              moves.push({ from, to: { row, col }, piece, captured: target });
            }
            break;
          }
          row += dr;
          col += dc;
        }
      }
      break;
    }
    case 'N': {
      for (const [dr, dc] of HORSE_OFFSETS) {
        const row = from.row + dr;
        const col = from.col + dc;
        if (!isInside(row, col)) continue;
        const legRow = Math.abs(dr) === 2 ? from.row + dr / 2 : from.row;
        const legCol = Math.abs(dc) === 2 ? from.col + dc / 2 : from.col;
        if (board[legRow][legCol]) continue;
        addMove(board, from, piece, row, col, moves);
      }
      break;
    }
    case 'B': {
      for (const [dr, dc] of ELEPHANT_OFFSETS) {
        const row = from.row + dr;
        const col = from.col + dc;
        if (!isInside(row, col) || !onOwnSide(piece.color, row)) continue;
        if (board[from.row + dr / 2][from.col + dc / 2]) continue;
        addMove(board, from, piece, row, col, moves);
      }
      break;
    }
    case 'A': {
      for (const [dr, dc] of DIAGONAL) {
        const row = from.row + dr;
        const col = from.col + dc;
        if (!inPalace(piece.color, row, col)) continue;
        addMove(board, from, piece, row, col, moves);
      }
      break;
    }
    case 'K': {
      for (const [dr, dc] of ORTHOGONAL) {
        const row = from.row + dr;
        const col = from.col + dc;
        if (!inPalace(piece.color, row, col)) continue;
        addMove(board, from, piece, row, col, moves);
      }

      const direction = piece.color === 'red' ? 1 : -1;
      for (let row = from.row + direction; row >= 0 && row < 10; row += direction) {
        const target = board[row][from.col];
        if (!target) continue;
        if (target.type === 'K' && target.color !== piece.color) {
          moves.push({ from, to: { row, col: from.col }, piece, captured: target });
        }
        break;
      }
      break;
    }
    case 'P': {
      const direction = piece.color === 'red' ? 1 : -1;
      addMove(board, from, piece, from.row + direction, from.col, moves);

      const crossedRiver = piece.color === 'red' ? from.row >= 5 : from.row <= 4;
      if (crossedRiver) {
        addMove(board, from, piece, from.row, from.col - 1, moves);
        addMove(board, from, piece, from.row, from.col + 1, moves);
      }
      break;
    }
  }

  return moves;
}

export function generatePseudoMoves(board: Board, color: Color): Move[] {
  const moves: Move[] = [];
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const piece = board[row][col];
      if (piece?.color === color) {
        moves.push(...generatePseudoMovesForPiece(board, { row, col }));
      }
    }
  }
  return moves;
}

export function isInCheck(board: Board, color: Color): boolean {
  const king = findKing(board, color);
  if (!king) return true;
  return generatePseudoMoves(board, opposite(color)).some((move) => sameSquare(move.to, king));
}

export function applyMoveToBoard(board: Board, move: Move): Board {
  const next = cloneBoard(board);
  next[move.from.row][move.from.col] = null;
  next[move.to.row][move.to.col] = move.piece;
  return next;
}

export function generateLegalMoves(board: Board, color: Color): Move[] {
  const legal: Move[] = [];
  for (const move of generatePseudoMoves(board, color)) {
    if (move.captured?.type === 'K') continue;
    const next = applyMoveToBoard(board, move);
    if (!isInCheck(next, color)) legal.push(move);
  }
  return legal;
}

export function findLegalMove(
  board: Board,
  color: Color,
  from: Square,
  to: Square,
): Move | null {
  return (
    generateLegalMoves(board, color).find(
      (move) => sameSquare(move.from, from) && sameSquare(move.to, to),
    ) ?? null
  );
}
