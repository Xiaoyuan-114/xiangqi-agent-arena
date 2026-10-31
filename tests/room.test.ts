import { describe, expect, it } from 'vitest';
import { INITIAL_FEN } from '../src/shared/engine/index.js';
import { Room, RoomError } from '../src/server/room.js';
import type { Participant } from '../src/server/room.js';

function expectRoomError(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error(`期望抛出 ${code}，实际没有抛出`);
  } catch (error) {
    expect(error).toBeInstanceOf(RoomError);
    expect((error as RoomError).code).toBe(code);
  }
}

function playToStart(room: Room): { red: Participant; black: Participant } {
  const red = room.join({ kind: 'agent', side: 'red', name: 'Red Agent' }).participant;
  const black = room.join({ kind: 'human', side: 'black', name: '玩家' }).participant;
  room.setReady(red, true);
  room.setReady(black, true);
  return { red, black };
}

describe('Room 落座与准备', () => {
  it('Agent 先进房准备，人类后加入准备后自动开局', () => {
    const room = new Room();
    const agent = room.join({ kind: 'agent', side: 'red', name: 'Qoder' });
    expect(agent.snapshot.status).toBe('waiting');
    expect(agent.snapshot.mode).toBe('waiting');

    room.setReady(agent.participant, true);
    let snapshot = room.getSnapshot();
    expect(snapshot.status).toBe('waiting');
    expect(snapshot.seats.red?.ready).toBe(true);
    expect(snapshot.seats.black).toBeNull();

    const human = room.join({ kind: 'human', side: 'black', name: '玩家' });
    snapshot = room.getSnapshot();
    expect(snapshot.mode).toBe('pve');
    expect(snapshot.seats.red?.ready).toBe(true);
    expect(snapshot.seats.black?.ready).toBe(false);

    snapshot = room.setReady(human.participant, true);
    expect(snapshot.status).toBe('playing');
    expect(snapshot.game?.turn).toBe('red');
    expect(snapshot.game?.fen).toBe(INITIAL_FEN);
    expect(snapshot.seats.red?.ready).toBe(false);
    expect(snapshot.seats.black?.ready).toBe(false);
    expect(room.you(agent.participant).seat).toBe('red');
  });

  it('支持双人与 Agent 对 Agent 模式', () => {
    const pvp = new Room();
    const red = pvp.join({ kind: 'human', side: 'red' }).participant;
    pvp.join({ kind: 'human', side: 'black' });
    expect(pvp.getSnapshot().mode).toBe('pvp');
    expect(pvp.getSnapshot().status).toBe('waiting');
    expect(roomReady(pvp, red)).toBe(false);

    const eve = new Room();
    const eveRed = eve.join({ kind: 'agent', side: 'red' });
    const eveBlack = eve.join({ kind: 'agent', side: 'black' });
    expect(eve.getSnapshot().mode).toBe('eve');
    eve.setReady(eveRed.participant, true);
    eve.setReady(eveBlack.participant, true);
    expect(eve.getSnapshot().status).toBe('playing');
  });

  it('clientKey 幂等，snapshot 不泄漏 token', () => {
    const room = new Room();
    const first = room.join({ kind: 'agent', side: 'red', clientKey: 'same-agent' });
    const retry = room.join({ kind: 'agent', side: 'black', clientKey: 'same-agent' });
    expect(retry.token).toBe(first.token);
    expect(retry.participant.id).toBe(first.participant.id);
    expect(retry.participant.seat).toBe('red');
    expect(room.participantCount).toBe(1);
    expect(JSON.stringify(room.getSnapshot())).not.toContain(first.token);
  });

  it('命名清理与房间满员', () => {
    const room = new Room();
    const first = room.join({ kind: 'human', side: 'red', name: '  玩\n家  甲  ' });
    expect(first.snapshot.seats.red?.name).toBe('玩 家 甲');
    room.join({ kind: 'human', side: 'black' });
    expectRoomError(() => room.join({ kind: 'human', side: 'any' }), 'ROOM_FULL');
    expectRoomError(() => room.join({ kind: 'human', side: 'red' }), 'ROOM_FULL');
  });

  it('对局中不能落座，准备状态不可修改', () => {
    const room = new Room();
    const { red } = playToStart(room);
    expectRoomError(() => room.join({ kind: 'human', side: 'any' }), 'GAME_IN_PROGRESS');
    expectRoomError(() => room.setReady(red, false), 'GAME_IN_PROGRESS');
  });
});

function roomReady(room: Room, participant: Participant): boolean {
  return room.you(participant).ready;
}

describe('Room 走子与终局', () => {
  it('轮转走子、幂等重试与非法着法', () => {
    const room = new Room();
    const { red, black } = playToStart(room);

    expectRoomError(() => room.move(black, 'a6', 'a5'), 'NOT_YOUR_TURN');
    expectRoomError(() => room.move(red, 'e0', 'e5'), 'ILLEGAL_MOVE');

    const move = room.move(red, 'h2', 'e2');
    expect(move.record.ucci).toBe('h2e2');
    expect(move.duplicate).toBe(false);
    expect(move.snapshot.game?.turn).toBe('black');
    expect(move.snapshot.game?.history).toHaveLength(1);

    const retry = room.move(red, 'h2', 'e2');
    expect(retry.duplicate).toBe(true);
    expect(room.getSnapshot().game?.history).toHaveLength(1);

    const reply = room.move(black, 'a6', 'a5');
    expect(reply.snapshot.game?.turn).toBe('red');
    expect(reply.snapshot.game?.history).toHaveLength(2);
  });

  it('认输、保留座位重赛、离席与重置', () => {
    const room = new Room();
    const { red, black } = playToStart(room);
    room.move(red, 'h2', 'e2');

    const resigned = room.resign(black);
    expect(resigned.status).toBe('finished');
    expect(resigned.game?.result).toEqual({ winner: 'red', reason: 'resign' });
    expect(resigned.seats.red?.ready).toBe(false);
    expect(resigned.seats.black?.ready).toBe(false);

    expect(room.setReady(red, true).status).toBe('finished');
    const rematch = room.setReady(black, true);
    expect(rematch.status).toBe('playing');
    expect(rematch.seats.red?.participantId).toBe(red.id);
    expect(rematch.seats.black?.participantId).toBe(black.id);
    expect(rematch.game?.history).toHaveLength(0);
    expect(rematch.game?.turn).toBe('red');

    expectRoomError(() => room.leave(red), 'LEAVE_NOT_ALLOWED');
    room.resign(red);
    const left = room.leave(black);
    expect(left.status).toBe('waiting');
    expect(left.game).toBeNull();
    expect(left.seats.black).toBeNull();
    expect(left.seats.red?.participantId).toBe(red.id);
    expect(left.seats.red?.ready).toBe(false);

    const reset = room.reset(red);
    expect(reset.status).toBe('waiting');
    expect(reset.seats.red).toBeNull();
    expect(reset.game).toBeNull();
    expect(room.authenticate(red.token)).toBeNull();
    expect(room.authenticate(black.token)).toBeNull();
  });
});
