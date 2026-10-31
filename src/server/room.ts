import {
  boardToFen,
  colorLabel,
  createInitialGame,
  generateLegalMoves,
  isInCheck,
  moveToUcci,
  parseSquare,
  pieceCode,
  playMove,
  resignGame,
} from '../shared/engine/index.js';
import type { Color, GameState, MoveRecord } from '../shared/engine/index.js';
import type {
  ApiErrorCode,
  GameSnapshot,
  JoinRequest,
  ParticipantKind,
  RoomMode,
  RoomSnapshot,
  RoomStatus,
  SeatSnapshot,
  YouInfo,
} from '../shared/protocol.js';
import { createParticipantId, createToken } from './auth.js';

interface RoomErrorDetails {
  legalMoves?: string[];
  turn?: Color;
}

export class RoomError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: RoomErrorDetails,
  ) {
    super(message);
    this.name = 'RoomError';
  }
}

export interface Participant {
  id: string;
  name: string;
  kind: ParticipantKind;
  token: string;
  clientKey?: string;
  seat: Color | null;
}

interface SeatState {
  participantId: string;
  ready: boolean;
}

type SeatMap = Record<Color, SeatState | null>;

export interface JoinResult {
  participant: Participant;
  token: string;
  snapshot: RoomSnapshot;
}

export interface MoveResult {
  snapshot: RoomSnapshot;
  record: MoveRecord;
  duplicate: boolean;
}

type RoomListener = (snapshot: RoomSnapshot) => void;

const COLORS: Color[] = ['red', 'black'];

function cleanName(raw: string | undefined, kind: ParticipantKind): string {
  const fallback = kind === 'agent' ? 'AI Agent' : '玩家';
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
  return cleaned || fallback;
}

export class Room {
  private _version = 0;
  private _status: RoomStatus = 'waiting';
  private seats: SeatMap = { red: null, black: null };
  private participants = new Map<string, Participant>();
  private tokenIndex = new Map<string, string>();
  private clientKeys = new Map<string, string>();
  private game: GameState | null = null;
  private listeners = new Set<RoomListener>();
  private cachedSnapshot: RoomSnapshot | null = null;
  private cachedVersion = -1;
  private lastMoveBy: string | null = null;
  private lastMoveUcci: string | null = null;
  private lastMoveId: string | null = null;

  get version(): number {
    return this._version;
  }

  get status(): RoomStatus {
    return this._status;
  }

  get participantCount(): number {
    return this.participants.size;
  }

  authenticate(token: string): Participant | null {
    const participantId = this.tokenIndex.get(token);
    if (!participantId) return null;
    return this.participants.get(participantId) ?? null;
  }

  hasParticipant(participantId: string): boolean {
    return this.participants.has(participantId);
  }

  join(input: JoinRequest): JoinResult {
    if (input.kind !== 'human' && input.kind !== 'agent') {
      throw new RoomError('INVALID_REQUEST', '参与者类型无效。');
    }
    if (input.side && !['red', 'black', 'any'].includes(input.side)) {
      throw new RoomError('INVALID_REQUEST', '落座颜色无效。');
    }
    if (input.clientKey && input.clientKey.length > 100) {
      throw new RoomError('INVALID_REQUEST', 'clientKey 过长。');
    }

    if (input.clientKey) {
      const existingId = this.clientKeys.get(input.clientKey);
      const existing = existingId ? this.participants.get(existingId) : undefined;
      if (existing) {
        return { participant: existing, token: existing.token, snapshot: this.getSnapshot() };
      }
      if (existingId) this.clientKeys.delete(input.clientKey);
    }

    if (this._status === 'playing') {
      throw new RoomError('GAME_IN_PROGRESS', '对局进行中，暂时不能落座。');
    }
    if (this._status === 'finished') {
      throw new RoomError('ROOM_NOT_JOINABLE', '本局已结束，请先重置房间。');
    }
    if (this.seats.red && this.seats.black) {
      throw new RoomError('ROOM_FULL', '房间已满。');
    }

    const requestedSide = input.side ?? 'any';
    let seatColor: Color;
    if (requestedSide === 'any') {
      seatColor = this.seats.red ? 'black' : 'red';
    } else {
      if (this.seats[requestedSide]) {
        throw new RoomError(
          'SEAT_TAKEN',
          `${requestedSide === 'red' ? '红方' : '黑方'}已有参与者。`,
        );
      }
      seatColor = requestedSide;
    }

    const participant: Participant = {
      id: createParticipantId(),
      name: cleanName(input.name, input.kind),
      kind: input.kind,
      token: createToken(),
      clientKey: input.clientKey,
      seat: seatColor,
    };

    this.participants.set(participant.id, participant);
    this.tokenIndex.set(participant.token, participant.id);
    if (input.clientKey) this.clientKeys.set(input.clientKey, participant.id);
    this.seats[seatColor] = { participantId: participant.id, ready: false };

    this.touch();
    return { participant, token: participant.token, snapshot: this.getSnapshot() };
  }

  you(participant: Participant): YouInfo {
    const active = this.requireActive(participant);
    const seat = active.seat ? this.seats[active.seat] : null;
    return {
      id: active.id,
      name: active.name,
      kind: active.kind,
      seat: active.seat,
      ready: seat?.ready ?? false,
    };
  }

  setReady(participant: Participant, ready: boolean): RoomSnapshot {
    const active = this.requireActive(participant);
    const { seat } = this.seatOf(active);

    if (this._status === 'playing') {
      throw new RoomError('GAME_IN_PROGRESS', '对局进行中，不能修改准备状态。');
    }

    const next = Boolean(ready);
    if (seat.ready === next) return this.getSnapshot();

    seat.ready = next;
    if (this.seats.red?.ready && this.seats.black?.ready) {
      this.startGame();
    }
    this.touch();
    return this.getSnapshot();
  }

  move(
    participant: Participant,
    fromName: string,
    toName: string,
    moveId?: string,
  ): MoveResult {
    const active = this.requireActive(participant);
    const { color } = this.seatOf(active);

    if (this._status !== 'playing' || !this.game) {
      throw new RoomError('GAME_NOT_ACTIVE', '当前没有进行中的对局。');
    }

    const ucci = `${fromName}${toName}`;
    if (this.isDuplicateMove(active, ucci, moveId)) {
      const record = this.game.history.at(-1);
      if (!record) throw new RoomError('INTERNAL_ERROR', '对局记录异常。');
      return { snapshot: this.getSnapshot(), record, duplicate: true };
    }

    if (this.game.turn !== color) {
      throw new RoomError('NOT_YOUR_TURN', `轮到${colorLabel(this.game.turn)}行棋。`, {
        turn: this.game.turn,
      });
    }

    const from = parseSquare(fromName);
    const to = parseSquare(toName);
    if (!from || !to) {
      throw new RoomError('ILLEGAL_MOVE', '坐标无效，应为 a0 至 i9 的起点和终点。', {
        legalMoves: this.legalMoves(),
      });
    }

    const outcome = playMove(this.game, from, to);
    if (!outcome.ok) {
      if (outcome.error === 'GAME_OVER') {
        throw new RoomError('GAME_NOT_ACTIVE', '对局已经结束。');
      }
      throw new RoomError('ILLEGAL_MOVE', '该着法不合法。', {
        legalMoves: this.legalMoves(),
      });
    }

    this.game = outcome.game;
    this.lastMoveBy = active.id;
    this.lastMoveUcci = outcome.record.ucci;
    this.lastMoveId = moveId ?? null;

    if (this.game.result) {
      this._status = 'finished';
      this.resetReadyFlags();
    } else {
      this._status = 'playing';
    }

    this.touch();
    return { snapshot: this.getSnapshot(), record: outcome.record, duplicate: false };
  }

  resign(participant: Participant): RoomSnapshot {
    const active = this.requireActive(participant);
    const { color } = this.seatOf(active);

    if (this._status !== 'playing' || !this.game) {
      throw new RoomError('GAME_NOT_ACTIVE', '当前没有进行中的对局。');
    }

    this.game = resignGame(this.game, color);
    this._status = 'finished';
    this.lastMoveId = null;
    this.resetReadyFlags();
    this.touch();
    return this.getSnapshot();
  }

  leave(participant: Participant): RoomSnapshot {
    const active = this.requireActive(participant);
    const { color } = this.seatOf(active);

    if (this._status === 'playing') {
      throw new RoomError('LEAVE_NOT_ALLOWED', '对局进行中，请先认输再离席。');
    }

    this.removeParticipant(active);
    this.seats[color] = null;
    this.game = null;
    this._status = 'waiting';
    this.lastMoveBy = null;
    this.lastMoveUcci = null;
    this.lastMoveId = null;
    this.resetReadyFlags();
    this.touch();
    return this.getSnapshot();
  }

  reset(participant: Participant): RoomSnapshot {
    const active = this.requireActive(participant);
    this.seatOf(active);

    this.participants.clear();
    this.tokenIndex.clear();
    this.clientKeys.clear();
    this.seats = { red: null, black: null };
    this.game = null;
    this._status = 'waiting';
    this.lastMoveBy = null;
    this.lastMoveUcci = null;
    this.lastMoveId = null;
    this.touch();
    return this.getSnapshot();
  }

  getSnapshot(): RoomSnapshot {
    if (!this.cachedSnapshot || this.cachedVersion !== this._version) {
      this.cachedSnapshot = this.buildSnapshot();
      this.cachedVersion = this._version;
    }
    return this.cachedSnapshot;
  }

  subscribe(listener: RoomListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private requireActive(participant: Participant): Participant {
    const active = this.participants.get(participant.id);
    if (!active || active.token !== participant.token) {
      throw new RoomError('SESSION_EXPIRED', '会话已失效，请重新落座。');
    }
    return active;
  }

  private seatOf(participant: Participant): { color: Color; seat: SeatState } {
    if (!participant.seat) {
      throw new RoomError('NOT_SEATED', '当前参与者尚未落座。');
    }
    const seat = this.seats[participant.seat];
    if (!seat || seat.participantId !== participant.id) {
      throw new RoomError('SESSION_EXPIRED', '座位状态异常，请重新落座。');
    }
    return { color: participant.seat, seat };
  }

  private isDuplicateMove(
    participant: Participant,
    ucci: string,
    moveId: string | undefined,
  ): boolean {
    if (this.lastMoveBy !== participant.id) return false;
    if (moveId && this.lastMoveId === moveId) return true;
    return this.lastMoveUcci === ucci;
  }

  private startGame(): void {
    this.game = createInitialGame();
    this._status = 'playing';
    this.lastMoveBy = null;
    this.lastMoveUcci = null;
    this.lastMoveId = null;
    this.resetReadyFlags();
  }

  private resetReadyFlags(): void {
    for (const color of COLORS) {
      const seat = this.seats[color];
      if (seat) seat.ready = false;
    }
  }

  private removeParticipant(participant: Participant): void {
    this.participants.delete(participant.id);
    this.tokenIndex.delete(participant.token);
    if (participant.clientKey) this.clientKeys.delete(participant.clientKey);
  }

  private legalMoves(): string[] {
    if (!this.game || this.game.result) return [];
    return generateLegalMoves(this.game.board, this.game.turn).map((move) =>
      moveToUcci(move.from, move.to),
    );
  }

  private buildSnapshot(): RoomSnapshot {
    const red = this.publicSeat('red');
    const black = this.publicSeat('black');
    return {
      version: this._version,
      status: this._status,
      mode: this.computeMode(),
      seats: { red, black },
      game: this.game ? this.buildGameSnapshot(this.game) : null,
    };
  }

  private publicSeat(color: Color): SeatSnapshot | null {
    const seat = this.seats[color];
    if (!seat) return null;
    const participant = this.participants.get(seat.participantId);
    if (!participant) return null;
    return {
      participantId: participant.id,
      name: participant.name,
      kind: participant.kind,
      ready: seat.ready,
    };
  }

  private computeMode(): RoomMode {
    const redSeat = this.seats.red;
    const blackSeat = this.seats.black;
    if (!redSeat || !blackSeat) return 'waiting';
    const red = this.participants.get(redSeat.participantId);
    const black = this.participants.get(blackSeat.participantId);
    if (!red || !black) return 'waiting';
    if (red.kind === 'human' && black.kind === 'human') return 'pvp';
    if (red.kind === 'agent' && black.kind === 'agent') return 'eve';
    return 'pve';
  }

  private buildGameSnapshot(game: GameState): GameSnapshot {
    return {
      board: game.board.map((row) => row.map((piece) => (piece ? pieceCode(piece) : null))),
      fen: boardToFen(game.board, game.turn),
      turn: game.turn,
      lastMove: game.history.at(-1) ?? null,
      history: [...game.history],
      inCheck: isInCheck(game.board, game.turn),
      legalMoves: this.legalMoves(),
      result: game.result,
    };
  }

  private touch(): void {
    this._version += 1;
    this.cachedSnapshot = null;
    this.cachedVersion = -1;
    const snapshot = this.getSnapshot();
    for (const listener of [...this.listeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('[xiangqi] room listener error', error);
      }
    }
  }
}
