import type { Color } from '../shared/engine/types.js';
import type {
  ApiErrorBody,
  ApiErrorCode,
  JoinRequest,
  JoinResponse,
  MeResponse,
  MoveResponse,
  ReadyResponse,
  RoomSnapshot,
  WaitResponse,
} from '../shared/protocol.js';

export const SERVER_URL = (process.env.XIANGQI_SERVER_URL ?? 'http://127.0.0.1:8787').replace(
  /\/+$/,
  '',
);

export class GameApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: { legalMoves?: string[]; turn?: Color },
  ) {
    super(message);
    this.name = 'GameApiError';
  }
}

interface SnapshotResponse {
  snapshot: RoomSnapshot;
}

async function request<T>(
  path: string,
  options: { method?: string; token?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timeout = options.timeoutMs ?? 15_000;
  const timer = setTimeout(() => controller.abort(), timeout);

  let response: Response;
  try {
    response = await fetch(`${SERVER_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    const reason = controller.signal.aborted ? '请求超时' : '无法连接';
    throw new GameApiError(
      0,
      'INTERNAL_ERROR',
      `${reason}对局服务 ${SERVER_URL}。请确认服务已启动。`,
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const body = data as ApiErrorBody | null;
    throw new GameApiError(
      response.status,
      body?.error?.code ?? 'INTERNAL_ERROR',
      body?.error?.message ?? `请求失败（${response.status}）`,
      body?.error
        ? { legalMoves: body.error.legalMoves, turn: body.error.turn }
        : undefined,
    );
  }

  return data as T;
}

export function apiState(): Promise<RoomSnapshot> {
  return request<RoomSnapshot>('/api/state');
}

export function apiJoin(input: JoinRequest): Promise<JoinResponse> {
  return request<JoinResponse>('/api/join', {
    method: 'POST',
    body: input,
  });
}

export function apiMe(token: string): Promise<MeResponse> {
  return request<MeResponse>('/api/me', { token });
}

export function apiReady(token: string, ready: boolean): Promise<ReadyResponse> {
  return request<ReadyResponse>('/api/ready', {
    method: 'POST',
    token,
    body: { ready },
  });
}

export function apiMove(token: string, from: string, to: string): Promise<MoveResponse> {
  return request<MoveResponse>('/api/move', {
    method: 'POST',
    token,
    body: { from, to },
  });
}

export function apiResign(token: string): Promise<SnapshotResponse> {
  return request<SnapshotResponse>('/api/resign', { method: 'POST', token });
}

export function apiLeave(token: string): Promise<SnapshotResponse> {
  return request<SnapshotResponse>('/api/leave', { method: 'POST', token });
}

export function apiWait(
  token: string,
  afterVersion: number | undefined,
  untilYourTurn: boolean,
  timeoutMs: number,
): Promise<WaitResponse> {
  const params = new URLSearchParams();
  if (afterVersion !== undefined) params.set('after', String(afterVersion));
  params.set('until', untilYourTurn ? 'myTurn' : 'change');
  params.set('timeoutMs', String(timeoutMs));
  return request<WaitResponse>(`/api/wait?${params.toString()}`, {
    token,
    timeoutMs: timeoutMs + 5000,
  });
}
