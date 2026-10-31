import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type {
  ApiErrorBody,
  ApiErrorCode,
  JoinRequest,
  RoomSnapshot,
} from '../shared/protocol.js';
import { tokenFromRequest } from './auth.js';
import { Room, RoomError } from './room.js';
import type { Participant } from './room.js';

const ERROR_STATUS: Record<ApiErrorCode, number> = {
  INVALID_REQUEST: 400,
  SESSION_EXPIRED: 401,
  NOT_SEATED: 403,
  SEAT_TAKEN: 409,
  ROOM_FULL: 409,
  ROOM_NOT_JOINABLE: 409,
  GAME_IN_PROGRESS: 409,
  GAME_NOT_ACTIVE: 409,
  NOT_YOUR_TURN: 409,
  LEAVE_NOT_ALLOWED: 409,
  ILLEGAL_MOVE: 422,
  INTERNAL_ERROR: 500,
};

function invalid(message: string): never {
  throw new RoomError('INVALID_REQUEST', message);
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') invalid(`${field} 必须是字符串。`);
  return value;
}

function writeSnapshotEvent(response: Response, snapshot: RoomSnapshot): void {
  response.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
}

interface WaitOutcome {
  snapshot: RoomSnapshot;
  timedOut: boolean;
}

function waitForRoomChange(
  room: Room,
  participant: Participant,
  afterVersion: number,
  untilYourTurn: boolean,
  timeoutMs: number,
): Promise<WaitOutcome> {
  const mySeat = participant.seat;
  if (!mySeat) throw new RoomError('NOT_SEATED', '当前参与者尚未落座。');

  const initial = room.getSnapshot();
  const isMyTurn = (snapshot: RoomSnapshot) =>
    snapshot.status === 'playing' && snapshot.game?.turn === mySeat;

  if (
    (untilYourTurn &&
      (initial.status === 'finished' || (initial.status === 'playing' && isMyTurn(initial)))) ||
    (!untilYourTurn && initial.version > afterVersion)
  ) {
    return Promise.resolve({ snapshot: initial, timedOut: false });
  }

  return new Promise((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout;

    const finish = (snapshot: RoomSnapshot, timedOut: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve({ snapshot, timedOut });
    };

    const unsubscribe = room.subscribe((snapshot) => {
      if (!room.hasParticipant(participant.id)) {
        finish(snapshot, false);
        return;
      }
      if (!untilYourTurn) {
        if (snapshot.version > afterVersion) finish(snapshot, false);
        return;
      }
      if (snapshot.status === 'finished') {
        finish(snapshot, false);
        return;
      }
      if (
        snapshot.status === 'playing' &&
        (snapshot.game?.turn === mySeat || initial.status !== 'playing')
      ) {
        finish(snapshot, false);
      }
    });

    timer = setTimeout(() => {
      finish(room.getSnapshot(), true);
    }, timeoutMs);
  });
}

export function createApp(room: Room = new Room()) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  const requireParticipant = (request: Request): Participant => {
    const token = tokenFromRequest(request);
    if (!token) throw new RoomError('SESSION_EXPIRED', '请先落座。');
    const participant = room.authenticate(token);
    if (!participant) {
      throw new RoomError('SESSION_EXPIRED', '会话已失效，请重新落座。');
    }
    return participant;
  };

  app.get('/api/health', (_request, response) => {
    response.json({
      ok: true,
      name: 'xiangqi-agent-arena',
      version: '0.1.0',
      room: { version: room.version, status: room.status },
    });
  });

  app.get('/api/state', (_request, response) => {
    response.json(room.getSnapshot());
  });

  app.get('/api/me', (request, response) => {
    const participant = requireParticipant(request);
    response.json({ you: room.you(participant), snapshot: room.getSnapshot() });
  });

  app.post('/api/join', (request, response) => {
    const body = request.body as Partial<JoinRequest> | undefined;
    if (!body || typeof body !== 'object') invalid('请求体必须是 JSON 对象。');
    if (body.kind !== 'human' && body.kind !== 'agent') {
      invalid('kind 必须是 human 或 agent。');
    }
    const side = body.side;
    if (side !== undefined && side !== 'red' && side !== 'black' && side !== 'any') {
      invalid('side 必须是 red、black 或 any。');
    }
    const name = optionalString(body.name, 'name');
    const clientKey = optionalString(body.clientKey, 'clientKey');

    const result = room.join({ kind: body.kind, side, name, clientKey });
    response.json({
      token: result.token,
      you: room.you(result.participant),
      snapshot: result.snapshot,
    });
  });

  app.get('/api/events', (request, response) => {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    response.write('retry: 2000\n\n');
    writeSnapshotEvent(response, room.getSnapshot());

    const unsubscribe = room.subscribe((snapshot) => {
      writeSnapshotEvent(response, snapshot);
    });
    const heartbeat = setInterval(() => {
      response.write(': ping\n\n');
    }, 15_000);

    request.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.get('/api/wait', async (request, response) => {
    const participant = requireParticipant(request);
    if (!participant.seat) {
      throw new RoomError('NOT_SEATED', '当前参与者尚未落座。');
    }

    const afterRaw = request.query.after;
    const afterVersion =
      typeof afterRaw === 'string' && afterRaw.length > 0 ? Number(afterRaw) : room.version;
    if (!Number.isInteger(afterVersion) || afterVersion < 0) {
      invalid('after 必须是非负整数。');
    }

    const untilYourTurn =
      request.query.until === 'myTurn' || request.query.untilYourTurn === 'true';
    const timeoutRaw = Number(request.query.timeoutMs ?? 15_000);
    const timeoutMs = Math.min(
      30_000,
      Math.max(1_000, Number.isFinite(timeoutRaw) ? Math.floor(timeoutRaw) : 15_000),
    );

    const outcome = await waitForRoomChange(
      room,
      participant,
      afterVersion,
      untilYourTurn,
      timeoutMs,
    );

    if (!room.hasParticipant(participant.id)) {
      throw new RoomError('SESSION_EXPIRED', '会话已失效，请重新落座。');
    }

    response.json({
      changed: outcome.snapshot.version > afterVersion,
      timedOut: outcome.timedOut,
      you: room.you(participant),
      snapshot: outcome.snapshot,
    });
  });

  app.post('/api/ready', (request, response) => {
    const participant = requireParticipant(request);
    const body = request.body as { ready?: unknown } | undefined;
    const ready = body?.ready === undefined ? true : body.ready;
    if (typeof ready !== 'boolean') invalid('ready 必须是布尔值。');
    response.json({ snapshot: room.setReady(participant, ready) });
  });

  app.post('/api/move', (request, response) => {
    const participant = requireParticipant(request);
    const body = request.body as { from?: unknown; to?: unknown; moveId?: unknown } | undefined;
    if (typeof body?.from !== 'string' || typeof body.to !== 'string') {
      invalid('from 与 to 必须是坐标字符串。');
    }
    if (body.moveId !== undefined && typeof body.moveId !== 'string') {
      invalid('moveId 必须是字符串。');
    }

    const result = room.move(participant, body.from, body.to, body.moveId);
    response.json({
      ok: true,
      ...(result.duplicate ? { duplicate: true } : {}),
      record: result.record,
      snapshot: result.snapshot,
    });
  });

  app.post('/api/resign', (request, response) => {
    const participant = requireParticipant(request);
    response.json({ snapshot: room.resign(participant) });
  });

  app.post('/api/leave', (request, response) => {
    const participant = requireParticipant(request);
    response.json({ snapshot: room.leave(participant) });
  });

  app.post('/api/reset', (request, response) => {
    const participant = requireParticipant(request);
    response.json({ snapshot: room.reset(participant) });
  });

  app.use('/api', (_request, response) => {
    response.status(404).json({
      error: { code: 'INVALID_REQUEST', message: '接口不存在。' },
    } satisfies ApiErrorBody);
  });

  app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    if (error instanceof RoomError) {
      response.status(ERROR_STATUS[error.code] ?? 500).json({
        error: {
          code: error.code,
          message: error.message,
          ...error.details,
        },
      } satisfies ApiErrorBody);
      return;
    }
    if (error instanceof SyntaxError) {
      response.status(400).json({
        error: { code: 'INVALID_REQUEST', message: '请求体不是合法 JSON。' },
      } satisfies ApiErrorBody);
      return;
    }
    console.error('[xiangqi] request error', error);
    response.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: '服务器内部错误。' },
    } satisfies ApiErrorBody);
  });

  return app;
}
