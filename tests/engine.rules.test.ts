import { describe, expect, it } from 'vitest';
import {
  createInitialGame,
  gameFromFen,
  generateLegalMoves,
  isInCheck,
  playUcci,
  resignGame,
} from '../src/shared/engine/index.js';
import { legalMovesOf, movesFrom, position } from './helpers.js';

describe('将军与终局', () => {
  it('识别将军并限制王的最优逃生格', () => {
    const fen = position('w', { e0: 'K', e9: 'k', e5: 'r' });
    const game = gameFromFen(fen);
    expect(isInCheck(game.board, 'red')).toBe(true);
    expect(movesFrom(fen, 'e0')).toEqual(['e0d0', 'e0f0']);
    expect(legalMovesOf(game)).toEqual(['e0d0', 'e0f0']);
  });

  it('识别将死', () => {
    const fen = position('b', {
      e9: 'k',
      a8: 'R',
      d1: 'R',
      e1: 'R',
      f1: 'R',
      a0: 'K',
    });
    const game = gameFromFen(fen);
    expect(isInCheck(game.board, 'black')).toBe(true);
    expect(generateLegalMoves(game.board, 'black')).toHaveLength(0);
    expect(game.result).toEqual({ winner: 'red', reason: 'checkmate' });
  });

  it('落子形成将死时正确结束对局', () => {
    const game = gameFromFen(
      position('w', { e9: 'k', a8: 'R', d1: 'R', f1: 'R', d2: 'R', a0: 'K' }),
    );
    expect(game.result).toBeNull();

    const outcome = playUcci(game, 'd2e2');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.record.check).toBe(true);
    expect(outcome.game.result).toEqual({ winner: 'red', reason: 'checkmate' });
    expect(outcome.game.turn).toBe('black');
  });

  it('困毙（无子可动但未被将军）判负', () => {
    const fen = position('b', { e9: 'k', a8: 'R', d1: 'R', f1: 'R', d0: 'K' });
    const game = gameFromFen(fen);
    expect(isInCheck(game.board, 'black')).toBe(false);
    expect(generateLegalMoves(game.board, 'black')).toHaveLength(0);
    expect(game.result).toEqual({ winner: 'red', reason: 'stalemate' });
  });

  it('认输由对方获胜', () => {
    const game = resignGame(createInitialGame(), 'red');
    expect(game.result).toEqual({ winner: 'black', reason: 'resign' });
    expect(game.history).toHaveLength(0);
  });
});

describe('重复局面与着法记录', () => {
  it('第三次出现同一局面判和', () => {
    let game = gameFromFen(position('w', { d0: 'K', f9: 'k', a0: 'R', a9: 'r' }));
    const cycle = ['a0b0', 'a9b9', 'b0a0', 'b9a9', 'a0b0', 'a9b9', 'b0a0', 'b9a9'];

    for (const ucci of cycle) {
      const outcome = playUcci(game, ucci);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      game = outcome.game;
    }

    expect(game.result).toEqual({ winner: 'draw', reason: 'repetition' });
    expect(game.history).toHaveLength(8);
  });

  it('记录标准 UCCI 着法，非法着法被拒', () => {
    const game = createInitialGame();
    expect(playUcci(game, 'a0a5').ok).toBe(false);
    expect(playUcci(game, 'e0e5').ok).toBe(false);

    const outcome = playUcci(game, 'h2e2');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.record).toEqual({
      ucci: 'h2e2',
      from: 'h2',
      to: 'e2',
      color: 'red',
      piece: 'C',
      captured: null,
      check: false,
    });
    expect(outcome.game.turn).toBe('black');
    expect(outcome.game.history).toHaveLength(1);
  });

  it('终局后拒绝继续走子', () => {
    const mate = gameFromFen(
      position('b', {
        e9: 'k',
        a8: 'R',
        d1: 'R',
        e1: 'R',
        f1: 'R',
        a0: 'K',
      }),
    );
    expect(playUcci(mate, 'e9e8')).toEqual({ ok: false, error: 'GAME_OVER' });
  });
});
