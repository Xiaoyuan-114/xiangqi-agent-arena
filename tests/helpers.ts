import {
  applyMoveToBoard,
  gameFromFen,
  generateLegalMoves,
  moveToUcci,
  opposite,
  parseSquare,
  sameSquare,
} from '../src/shared/engine/index.js';
import type { Board, Color, GameState } from '../src/shared/engine/index.js';

export function position(turn: 'w' | 'b', pieces: Record<string, string>): string {
  const rows = Array.from({ length: 10 }, () => Array<string>(9).fill(''));
  for (const [name, char] of Object.entries(pieces)) {
    const square = parseSquare(name);
    if (!square) throw new Error(`无效坐标 ${name}`);
    rows[square.row][square.col] = char;
  }

  const ranks: string[] = [];
  for (let row = 9; row >= 0; row -= 1) {
    let rank = '';
    let empty = 0;
    for (let col = 0; col < 9; col += 1) {
      if (!rows[row][col]) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        rank += String(empty);
        empty = 0;
      }
      rank += rows[row][col];
    }
    if (empty > 0) rank += String(empty);
    ranks.push(rank);
  }
  return `${ranks.join('/')} ${turn} - - 0 1`;
}

export function movesFrom(fen: string, fromName: string): string[] {
  const game = gameFromFen(fen);
  const from = parseSquare(fromName);
  if (!from) throw new Error(`无效坐标 ${fromName}`);
  return generateLegalMoves(game.board, game.turn)
    .filter((move) => sameSquare(move.from, from))
    .map((move) => moveToUcci(move.from, move.to))
    .sort();
}

export function legalMovesOf(game: GameState): string[] {
  return generateLegalMoves(game.board, game.turn)
    .map((move) => moveToUcci(move.from, move.to))
    .sort();
}

export function perft(board: Board, color: Color, depth: number): number {
  if (depth === 0) return 1;
  const moves = generateLegalMoves(board, color);
  if (depth === 1) return moves.length;

  let nodes = 0;
  for (const move of moves) {
    nodes += perft(applyMoveToBoard(board, move), opposite(color), depth - 1);
  }
  return nodes;
}
