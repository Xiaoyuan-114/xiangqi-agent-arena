import { useCallback, useEffect, useRef, useState } from 'react';
import type { Color } from '../shared/engine/types.js';
import type { RoomSnapshot, YouInfo } from '../shared/protocol.js';
import {
  ApiError,
  api,
  clearStoredToken,
  getStoredToken,
  storeName,
  storeToken,
} from './api.js';

export type ConnectionState = 'connecting' | 'online' | 'reconnecting';

export interface JoinInput {
  name: string;
  side: Color;
}

export interface JoinResult {
  you: YouInfo;
  snapshot: RoomSnapshot;
}

export function useRoom() {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [me, setMe] = useState<YouInfo | null>(null);
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const hasConnectedRef = useRef(false);
  const forceNextSnapshotRef = useRef(false);

  const applySnapshot = useCallback((next: RoomSnapshot) => {
    setSnapshot((previous) => {
      if (!previous || next.version >= previous.version) return next;
      return previous;
    });
  }, []);

  const forgetSession = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setMe(null);
  }, []);

  const handleError = useCallback(
    (caught: unknown) => {
      const apiError =
        caught instanceof ApiError
          ? caught
          : new ApiError(0, 'INTERNAL_ERROR', '操作失败，请稍后再试。');
      setError(apiError.message);
      if (apiError.code === 'SESSION_EXPIRED') forgetSession();
    },
    [forgetSession],
  );

  useEffect(() => {
    let cancelled = false;
    const stored = getStoredToken();

    if (stored) {
      setToken(stored);
      api
        .me(stored)
        .then((result) => {
          if (cancelled) return;
          setMe(result.you);
          applySnapshot(result.snapshot);
        })
        .catch((caught: unknown) => {
          if (cancelled) return;
          if (caught instanceof ApiError && caught.code === 'SESSION_EXPIRED') {
            forgetSession();
          } else {
            handleError(caught);
          }
        });
    }

    api
      .state()
      .then((next) => {
        if (!cancelled) applySnapshot(next);
      })
      .catch((caught: unknown) => {
        if (!cancelled) handleError(caught);
      });

    const source = new EventSource('/api/events');
    source.onopen = () => {
      setConnection('online');
      if (hasConnectedRef.current) forceNextSnapshotRef.current = true;
      hasConnectedRef.current = true;
    };
    source.onerror = () => {
      setConnection((previous) => (previous === 'connecting' ? 'connecting' : 'reconnecting'));
    };
    source.addEventListener('snapshot', (event) => {
      try {
        const next = JSON.parse((event as MessageEvent<string>).data) as RoomSnapshot;
        const force = forceNextSnapshotRef.current;
        forceNextSnapshotRef.current = false;
        setSnapshot((previous) =>
          !previous || next.version >= previous.version || force ? next : previous,
        );
        setConnection('online');
      } catch {
        // Ignore malformed events; EventSource will keep the last valid snapshot.
      }
    });

    return () => {
      cancelled = true;
      source.close();
    };
  }, [applySnapshot, forgetSession, handleError]);

  useEffect(() => {
    if (!me || !snapshot) return;
    const stillSeated = (['red', 'black'] as Color[]).some(
      (color) => snapshot.seats[color]?.participantId === me.id,
    );
    if (!stillSeated) {
      forgetSession();
      return;
    }
    if (me.seat) {
      const seat = snapshot.seats[me.seat];
      if (seat && seat.ready !== me.ready) {
        setMe((previous) => (previous ? { ...previous, ready: seat.ready } : previous));
      }
    }
  }, [snapshot, me, forgetSession]);

  const run = async <T,>(task: () => Promise<T>): Promise<T | undefined> => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      return await task();
    } catch (caught) {
      handleError(caught);
      return undefined;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const join = async (input: JoinInput): Promise<JoinResult | undefined> => {
    if (!input.name.trim()) {
      setError('请先填写名字。');
      return undefined;
    }
    return run(async () => {
      const result = await api.join({
        kind: 'human',
        name: input.name.trim(),
        side: input.side,
      });
      storeToken(result.token);
      storeName(result.you.name);
      setToken(result.token);
      setMe(result.you);
      applySnapshot(result.snapshot);
      return { you: result.you, snapshot: result.snapshot };
    });
  };

  const setReady = async (ready: boolean): Promise<void> => {
    if (!token) return;
    await run(async () => {
      const result = await api.ready(token, ready);
      applySnapshot(result.snapshot);
    });
  };

  const makeMove = async (from: string, to: string): Promise<boolean> => {
    if (!token) return false;
    const result = await run(async () => {
      const response = await api.move(token, from, to);
      applySnapshot(response.snapshot);
      return true;
    });
    return result === true;
  };

  const resign = async (): Promise<void> => {
    if (!token) return;
    await run(async () => {
      const result = await api.resign(token);
      applySnapshot(result.snapshot);
    });
  };

  const leave = async (): Promise<void> => {
    if (!token) return;
    await run(async () => {
      const result = await api.leave(token);
      forgetSession();
      applySnapshot(result.snapshot);
    });
  };

  const resetRoom = async (): Promise<void> => {
    if (!token) return;
    await run(async () => {
      const result = await api.reset(token);
      forgetSession();
      applySnapshot(result.snapshot);
    });
  };

  return {
    snapshot,
    me,
    token,
    connection,
    busy,
    error,
    join,
    setReady,
    makeMove,
    resign,
    leave,
    resetRoom,
    clearError: () => setError(null),
  };
}
