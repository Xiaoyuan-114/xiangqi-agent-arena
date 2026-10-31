import type { Color } from '../shared/engine/types.js';
import type {
  ApiErrorBody,
  ApiErrorCode,
  JoinRequest,
  JoinResponse,
  MeResponse,
  MoveResponse,
  ReadyResponse,
  ResetResponse,
  RoomSnapshot,
  WaitResponse,
} from '../shared/protocol.js';

const TOKEN_KEY = 'xiangqi.token';
const CLIENT_KEY = 'xiangqi.clientKey';
const NAME_KEY = 'xiangqi.name';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: { legalMoves?: string[]; turn?: Color },
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function getClientKey(): string {
  let key = sessionStorage.getItem(CLIENT_KEY);
  if (!key) {
    key = crypto.randomUUID();
    sessionStorage.setItem(CLIENT_KEY, key);
  }
  return key;
}

export function getStoredName(): string {
  return sessionStorage.getItem(NAME_KEY) ?? '玩家';
}

export function storeName(name: string): void {
  sessionStorage.setItem(NAME_KEY, name);
}

async function request<T>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, 'INTERNAL_ERROR', '无法连接对局服务，请确认服务已启动。');
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const body = data as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'INTERNAL_ERROR',
      body?.error?.message ?? `请求失败（${response.status}）`,
      body?.error ? { legalMoves: body.error.legalMoves, turn: body.error.turn } : undefined,
    );
  }

  return data as T;
}

interface SnapshotResponse {
  snapshot: RoomSnapshot;
}

export const api = {
  state: () => request<RoomSnapshot>('/api/state'),
  me: (token: string) => request<MeResponse>('/api/me', { token }),
  join: (input: JoinRequest) =>
    request<JoinResponse>('/api/join', {
      method: 'POST',
      body: { ...input, clientKey: input.clientKey ?? getClientKey() },
    }),
  ready: (token: string, ready = true) =>
    request<ReadyResponse>('/api/ready', {
      method: 'POST',
      token,
      body: { ready },
    }),
  move: (token: string, from: string, to: string) =>
    request<MoveResponse>('/api/move', {
      method: 'POST',
      token,
      body: { from, to },
    }),
  resign: (token: string) =>
    request<SnapshotResponse>('/api/resign', { method: 'POST', token }),
  leave: (token: string) =>
    request<SnapshotResponse>('/api/leave', { method: 'POST', token }),
  reset: (token: string) =>
    request<ResetResponse>('/api/reset', { method: 'POST', token }),
  wait: (token: string, after: number, timeoutMs = 15_000) =>
    request<WaitResponse>(
      `/api/wait?after=${after}&until=myTurn&timeoutMs=${timeoutMs}`,
      { token },
    ),
};
