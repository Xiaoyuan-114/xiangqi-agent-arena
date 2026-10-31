import type { Color, GameResult, MoveRecord } from './engine/index.js';

export type ParticipantKind = 'human' | 'agent';

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export type RoomMode = 'waiting' | 'pvp' | 'pve' | 'eve';

export interface SeatSnapshot {
  participantId: string;
  name: string;
  kind: ParticipantKind;
  ready: boolean;
}

export type SeatsSnapshot = Record<Color, SeatSnapshot | null>;

export interface GameSnapshot {
  board: (string | null)[][];
  fen: string;
  turn: Color;
  lastMove: MoveRecord | null;
  history: MoveRecord[];
  inCheck: boolean;
  legalMoves: string[];
  result: GameResult | null;
}

export interface RoomSnapshot {
  version: number;
  status: RoomStatus;
  mode: RoomMode;
  seats: SeatsSnapshot;
  game: GameSnapshot | null;
}

export interface YouInfo {
  id: string;
  name: string;
  kind: ParticipantKind;
  seat: Color | null;
  ready: boolean;
}

export type ApiErrorCode =
  | 'INVALID_REQUEST'
  | 'SESSION_EXPIRED'
  | 'SEAT_TAKEN'
  | 'ROOM_FULL'
  | 'ROOM_NOT_JOINABLE'
  | 'NOT_SEATED'
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_MOVE'
  | 'GAME_IN_PROGRESS'
  | 'GAME_NOT_ACTIVE'
  | 'LEAVE_NOT_ALLOWED'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    legalMoves?: string[];
    turn?: Color;
  };
}

export interface JoinRequest {
  name?: string;
  kind: ParticipantKind;
  side?: Color | 'any';
  clientKey?: string;
}

export interface JoinResponse {
  token: string;
  you: YouInfo;
  snapshot: RoomSnapshot;
}

export interface MeResponse {
  you: YouInfo;
  snapshot: RoomSnapshot;
}

export interface ReadyRequest {
  ready?: boolean;
}

export interface ReadyResponse {
  snapshot: RoomSnapshot;
}

export interface MoveRequest {
  from: string;
  to: string;
  moveId?: string;
}

export interface MoveResponse {
  ok: true;
  duplicate?: boolean;
  record: MoveRecord;
  snapshot: RoomSnapshot;
}

export interface WaitResponse {
  changed: boolean;
  timedOut: boolean;
  you: YouInfo;
  snapshot: RoomSnapshot;
}

export interface ResetResponse {
  snapshot: RoomSnapshot;
}

export interface HealthResponse {
  ok: true;
  name: string;
  version: string;
  room: {
    version: number;
    status: RoomStatus;
  };
}
