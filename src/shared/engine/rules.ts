import {
  boardToFen,
  createInitialBoard,
  parseFen,
  positionKey,
} from './board.js';
import {
  applyMoveToBoard,
  findLegalMove,
  generateLegalMoves,
  isInCheck,
} from './moves.js';
import { moveToUcci, parseUcci, squareToName } from './notation.js';
import type {
  Color,
  GameResult,
  GameState,
  MoveRecord,
  Square,
} from './types.js';
import { opposite } from './types.js';

export function createInitialGame(): GameState {
  const board = createInitialBoard();
  return {
    board,
    turn: 'red',
    history: [],
    positionCounts: new Map([[positionKey(board, 'red'), 1]]),
    result: null,
  };
}

function terminalResult(board: GameState['board'], color: Color): GameResult | null {
  const legalMoves = generateLegalMoves(board, color);
  if (legalMoves.length > 0) return null;
  return {
    winner: opposite(color),
    reason: isInCheck(board, color) ? 'checkmate' : 'stalemate',
  };
}

export function gameFromFen(fen: string): GameState {
  const { board, turn } = parseFen(fen);
  return {
    board,
    turn,
    history: [],
    positionCounts: new Map([[positionKey(board, turn), 1]]),
    result: terminalResult(board, turn),
  };
}

export interface MoveSuccess {
  ok: true;
  game: GameState;
  record: MoveRecord;
}

export interface MoveFailure {
  ok: false;
  error: 'GAME_OVER' | 'ILLEGAL_MOVE';
}

export type MoveOutcome = MoveSuccess | MoveFailure;

export function playMove(game: GameState, from: Square, to: Square): MoveOutcome {
  if (game.result) return { ok: false, error: 'GAME_OVER' };

  const move = findLegalMove(game.board, game.turn, from, to);
  if (!move) return { ok: false, error: 'ILLEGAL_MOVE' };

  const nextBoard = applyMoveToBoard(game.board, move);
  const nextTurn = opposite(game.turn);
  const check = isInCheck(nextBoard, nextTurn);
  const opponentMoves = generateLegalMoves(nextBoard, nextTurn);

  let result: GameResult | null = null;
  if (opponentMoves.length === 0) {
    result = {
      winner: game.turn,
      reason: check ? 'checkmate' : 'stalemate',
    };
  }

  const key = positionKey(nextBoard, nextTurn);
  const positionCounts = new Map(game.positionCounts);
  const occurrence = (positionCounts.get(key) ?? 0) + 1;
  positionCounts.set(key, occurrence);

  if (!result && occurrence >= 3) {
    result = { winner: 'draw', reason: 'repetition' };
  }

  const record: MoveRecord = {
    ucci: moveToUcci(move.from, move.to),
    from: squareToName(move.from)!,
    to: squareToName(move.to)!,
    color: game.turn,
    piece: move.piece.type,
    captured: move.captured?.type ?? null,
    check,
  };

  const nextGame: GameState = {
    board: nextBoard,
    turn: nextTurn,
    history: [...game.history, record],
    positionCounts,
    result,
  };

  return { ok: true, game: nextGame, record };
}

export function playUcci(game: GameState, ucci: string): MoveOutcome {
  const parsed = parseUcci(ucci);
  if (!parsed) return { ok: false, error: 'ILLEGAL_MOVE' };
  return playMove(game, parsed.from, parsed.to);
}

export function resignGame(game: GameState, color: Color): GameState {
  if (game.result) return game;
  return {
    ...game,
    result: { winner: opposite(color), reason: 'resign' },
  };
}

export function currentFen(game: GameState): string {
  return boardToFen(game.board, game.turn);
}

export function legalMoveCount(game: GameState): number {
  return generateLegalMoves(game.board, game.turn).length;
}
