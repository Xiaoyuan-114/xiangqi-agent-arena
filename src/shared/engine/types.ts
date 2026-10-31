export type Color = 'red' | 'black';

export type PieceType = 'K' | 'A' | 'B' | 'N' | 'R' | 'C' | 'P';

export interface Piece {
  type: PieceType;
  color: Color;
}

export type Board = (Piece | null)[][];

export interface Square {
  row: number;
  col: number;
}

export interface Move {
  from: Square;
  to: Square;
  piece: Piece;
  captured: Piece | null;
}

export type ResultReason = 'checkmate' | 'stalemate' | 'resign' | 'repetition';

export interface GameResult {
  winner: Color | 'draw';
  reason: ResultReason;
}

export interface MoveRecord {
  ucci: string;
  from: string;
  to: string;
  color: Color;
  piece: PieceType;
  captured: PieceType | null;
  check: boolean;
}

export interface GameState {
  board: Board;
  turn: Color;
  history: MoveRecord[];
  positionCounts: Map<string, number>;
  result: GameResult | null;
}

export function opposite(color: Color): Color {
  return color === 'red' ? 'black' : 'red';
}

export function sameSquare(a: Square, b: Square): boolean {
  return a.row === b.row && a.col === b.col;
}
