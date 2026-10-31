import { describe, expect, it } from 'vitest';
import {
  boardToFen,
  createInitialGame,
  INITIAL_FEN,
  parseFen,
} from '../src/shared/engine/index.js';
import { movesFrom, perft, position } from './helpers.js';

describe('棋盘与记谱', () => {
  it('初始 FEN 可无损往返', () => {
    const { board, turn } = parseFen(INITIAL_FEN);
    expect(turn).toBe('red');
    expect(boardToFen(board, 'red')).toBe(INITIAL_FEN);
    expect(board[0][4]).toEqual({ type: 'K', color: 'red' });
    expect(board[9][4]).toEqual({ type: 'K', color: 'black' });
    expect(board[0][0]).toEqual({ type: 'R', color: 'red' });
    expect(board[9][0]).toEqual({ type: 'R', color: 'black' });
  });
});

describe('走子生成', () => {
  it('初始局面与 perft', () => {
    const game = createInitialGame();
    expect(perft(game.board, 'red', 1)).toBe(44);
    expect(perft(game.board, 'red', 2)).toBe(1920);
    expect(perft(game.board, 'red', 3)).toBe(79666);
  }, 30_000);

  it('马腿阻挡', () => {
    const base = { d0: 'K', f9: 'k', e4: 'N' };
    expect(movesFrom(position('w', base), 'e4')).toEqual([
      'e4c3',
      'e4c5',
      'e4d2',
      'e4d6',
      'e4f2',
      'e4f6',
      'e4g3',
      'e4g5',
    ]);

    const rightLegBlocked = movesFrom(position('w', { ...base, d4: 'P' }), 'e4');
    expect(rightLegBlocked).not.toContain('e4c3');
    expect(rightLegBlocked).not.toContain('e4c5');
    expect(rightLegBlocked).toHaveLength(6);

    const upLegBlocked = movesFrom(position('w', { ...base, e3: 'P' }), 'e4');
    expect(upLegBlocked).not.toContain('e4d2');
    expect(upLegBlocked).not.toContain('e4f2');
    expect(upLegBlocked).toHaveLength(6);

    const downLegBlocked = movesFrom(position('w', { ...base, e5: 'P' }), 'e4');
    expect(downLegBlocked).not.toContain('e4d6');
    expect(downLegBlocked).not.toContain('e4f6');
    expect(downLegBlocked).toHaveLength(6);
  });

  it('象眼与不过河', () => {
    const base = { d0: 'K', f9: 'k', c0: 'B' };
    expect(movesFrom(position('w', base), 'c0')).toEqual(['c0a2', 'c0e2']);

    const eyeBlocked = movesFrom(position('w', { ...base, d1: 'A' }), 'c0');
    expect(eyeBlocked).toEqual(['c0a2']);

    const crossed = { d0: 'K', f9: 'k', e4: 'B' };
    expect(movesFrom(position('w', crossed), 'e4')).toEqual(['e4c2', 'e4g2']);
  });

  it('炮的零子、一子与两子炮架', () => {
    const base = { d0: 'K', f9: 'k', e9: 'r', e1: 'C' };
    expect(movesFrom(position('w', base), 'e1')).not.toContain('e1e9');

    const oneScreen = movesFrom(position('w', { ...base, e5: 'P' }), 'e1');
    expect(oneScreen).toContain('e1e9');

    const twoScreens = movesFrom(position('w', { ...base, e5: 'P', e7: 'P' }), 'e1');
    expect(twoScreens).not.toContain('e1e9');
  });

  it('兵卒过河前后移动规则', () => {
    const redBeforeRiver = { d0: 'K', f9: 'k', e4: 'P' };
    expect(movesFrom(position('w', redBeforeRiver), 'e4')).toEqual(['e4e5']);

    const redAfterRiver = { d0: 'K', f9: 'k', e5: 'P' };
    expect(movesFrom(position('w', redAfterRiver), 'e5')).toEqual(['e5d5', 'e5e6', 'e5f5']);

    const blackAfterRiver = { d0: 'K', f9: 'k', e4: 'p' };
    expect(movesFrom(position('b', blackAfterRiver), 'e4')).toEqual(['e4d4', 'e4e3', 'e4f4']);

    const blackBeforeRiver = { d0: 'K', f9: 'k', e6: 'p' };
    expect(movesFrom(position('b', blackBeforeRiver), 'e6')).toEqual(['e6e5']);
  });

  it('士与将帅限制在九宫', () => {
    expect(movesFrom(INITIAL_FEN, 'd0')).toEqual(['d0e1']);
    expect(movesFrom(INITIAL_FEN, 'e0')).toEqual(['e0e1']);
  });

  it('将帅照面：不能移开唯一的遮挡子', () => {
    const fen = position('w', { e0: 'K', e9: 'k', e5: 'P' });
    expect(movesFrom(fen, 'e5')).toContain('e5e6');
    expect(movesFrom(fen, 'e5')).not.toContain('e5d5');
    expect(movesFrom(fen, 'e5')).not.toContain('e5f5');
  });
});
