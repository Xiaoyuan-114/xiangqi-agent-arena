import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import type { RoomSnapshot, YouInfo } from '../shared/protocol.js';
import {
  GameApiError,
  SERVER_URL,
  apiJoin,
  apiLeave,
  apiMe,
  apiMove,
  apiReady,
  apiResign,
  apiState,
  apiWait,
} from './apiClient.js';
import {
  formatLegalMoves,
  formatState,
  resultSummary,
  sideLabel,
} from './format.js';

const SQUARE = z.string().regex(/^[a-i][0-9]$/, '坐标格式应为 a0 至 i9');

const instructions = [
  '你是通过 MCP 参与中国象棋对弈的 Agent。对局服务运行在 ' + SERVER_URL + '。',
  '',
  '标准流程：',
  '1. 调用 join_game 落座（可选 side: red/black/any，不指定则先红后黑）。',
  '2. 调用 set_ready 准备。双方都准备后自动开局。',
  '3. 轮到你时，从棋局状态里的“合法着法”中选择一步，调用 make_move。',
  '4. 走完后调用 wait_for_update 等待对方走棋；它会阻塞一段时间并在需要你行动时返回。超时不是错误，再次调用即可。',
  '5. 循环第 3-4 步直到 status 为 finished。不要在中途停止。',
  '',
  '坐标：列 a-i 为红方视角从左到右，行 0-9 从红方底线向上。红帅在 e0，黑将在 e9；例如炮二平五对应 h2→e2。',
  '只能在合法着法中走子；不要自行发明坐标。困毙判负，三次重复局面判和。',
  '对局结束后可 set_ready(true) 再来一局（保留座位和颜色），或 leave_game 离席。',
].join('\n');

interface Session {
  token: string | null;
  you: YouInfo | null;
  lastVersion: number | null;
  clientKey: string;
}

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

function errorResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

function forget(session: Session): void {
  session.token = null;
  session.you = null;
  session.lastVersion = null;
}

function syncSession(session: Session, snapshot: RoomSnapshot): void {
  session.lastVersion = snapshot.version;
  if (!session.you?.seat) return;
  const seat = snapshot.seats[session.you.seat];
  if (seat?.participantId === session.you.id) {
    session.you = { ...session.you, ready: seat.ready };
  }
}

function apiErrorText(error: GameApiError): string {
  const lines = [`请求失败（${error.code}）：${error.message}`];
  if (error.code === 'SESSION_EXPIRED') {
    lines.push('会话已失效；请重新调用 join_game。');
  }
  if (error.details?.turn) {
    lines.push(`当前行棋方：${sideLabel(error.details.turn)}。`);
  }
  if (error.details?.legalMoves?.length) {
    lines.push('');
    lines.push(formatLegalMoves(error.details.legalMoves));
  }
  return lines.join('\n');
}

async function publicStateSafe(): Promise<RoomSnapshot | null> {
  try {
    return await apiState();
  } catch {
    return null;
  }
}

function createServer() {
  const session: Session = {
    token: null,
    you: null,
    lastVersion: null,
    clientKey: process.env.XIANGQI_CLIENT_KEY ?? randomUUID(),
  };

  const server = new McpServer(
    { name: 'xiangqi-agent-arena', version: '0.1.0' },
    { instructions },
  );

  const guarded = async (task: () => Promise<ToolResult>): Promise<ToolResult> => {
    try {
      return await task();
    } catch (error) {
      if (error instanceof GameApiError) {
        if (error.code === 'SESSION_EXPIRED') forget(session);
        return errorResult(apiErrorText(error));
      }
      return errorResult(`工具执行失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const requireToken = (): string | null => session.token;

  server.registerTool(
    'join_game',
    {
      title: '入座对弈',
      description:
        '加入当前棋室并落座。单房间、红黑两席；一个 MCP 进程代表一位 Agent。若已落座则返回当前状态。可指定 side=red/black/any，name 为显示名。',
      inputSchema: z.object({
        name: z.string().min(1).max(24).optional().describe('显示在棋室中的名字'),
        side: z
          .enum(['red', 'black', 'any'])
          .optional()
          .describe('希望执红、执黑或任意空位；默认 any'),
      }),
    },
    async ({ name, side }) => {
      try {
        if (session.token) {
          try {
            const me = await apiMe(session.token);
            session.you = me.you;
            syncSession(session, me.snapshot);
            return textResult(
              `你已经落座${me.you.seat ? `（${sideLabel(me.you.seat)}）` : ''}。下一步可调用 set_ready(true) 准备。\n\n${formatState(me.snapshot, me.you)}`,
            );
          } catch (error) {
            if (error instanceof GameApiError && error.code === 'SESSION_EXPIRED') {
              forget(session);
            } else {
              throw error;
            }
          }
        }

        const agentName = name?.trim() || process.env.XIANGQI_AGENT_NAME || 'AI Agent';
        const result = await apiJoin({
          kind: 'agent',
          name: agentName,
          side: side ?? 'any',
          clientKey: session.clientKey,
        });
        session.token = result.token;
        session.you = result.you;
        syncSession(session, result.snapshot);

        return textResult(
          `落座成功${result.you.seat ? `（${sideLabel(result.you.seat)}）` : ''}。下一步调用 set_ready(true) 准备；双方准备后自动开局。\n\n${formatState(result.snapshot, result.you)}`,
        );
      } catch (error) {
        if (error instanceof GameApiError) {
          const snapshot = await publicStateSafe();
          const extra = snapshot ? `\n\n${formatState(snapshot, null)}` : '';
          return errorResult(apiErrorText(error) + extra);
        }
        return errorResult(`入座失败：${error instanceof Error ? error.message : '未知错误'}`);
      }
    },
  );

  server.registerTool(
    'set_ready',
    {
      title: '准备 / 再来一局',
      description:
        '设置准备状态，默认 true。双方都准备后自动开局；对局结束后再次调用即为再来一局（保留座位和颜色）。',
      inputSchema: z.object({
        ready: z.boolean().optional().describe('true 准备，false 取消准备；默认 true'),
      }),
    },
    async ({ ready }) =>
      guarded(async () => {
        const token = requireToken();
        if (!token) {
          return errorResult('尚未落座。请先调用 join_game。');
        }
        const shouldReady = ready ?? true;
        const result = await apiReady(token, shouldReady);
        syncSession(session, result.snapshot);
        const status =
          result.snapshot.status === 'playing'
            ? '双方已准备，对局开始。'
            : shouldReady
              ? '已准备，等待对手。'
              : '已取消准备。';
        return textResult(`${status}\n\n${formatState(result.snapshot, session.you)}`);
      }),
  );

  server.registerTool(
    'get_game_state',
    {
      title: '查看棋局',
      description:
        '查看棋室、座位、行棋方、ASCII 棋盘、FEN、最近着法和你当前回合的合法着法。',
      inputSchema: z.object({}),
    },
    async () =>
      guarded(async () => {
        if (session.token) {
          try {
            const me = await apiMe(session.token);
            session.you = me.you;
            syncSession(session, me.snapshot);
            return textResult(formatState(me.snapshot, me.you));
          } catch (error) {
            if (error instanceof GameApiError && error.code === 'SESSION_EXPIRED') {
              forget(session);
            } else {
              throw error;
            }
          }
        }
        const snapshot = await apiState();
        return textResult(formatState(snapshot, null));
      }),
  );

  server.registerTool(
    'list_legal_moves',
    {
      title: '列出合法着法',
      description:
        '列出你当前回合的全部合法着法（UCCI 格式），可选 from 参数过滤某个起点（如 from=h2）。只能走这些着法。',
      inputSchema: z.object({
        from: SQUARE.optional().describe('可选：只看某个起点的合法着法，例如 h2'),
      }),
    },
    async ({ from }) =>
      guarded(async () => {
        const token = requireToken();
        if (!token) {
          return errorResult('尚未落座。请先调用 join_game。');
        }
        const me = await apiMe(token);
        session.you = me.you;
        syncSession(session, me.snapshot);
        const game = me.snapshot.game;

        if (!game) {
          return errorResult(`当前没有进行中的对局。\n\n${formatState(me.snapshot, me.you)}`);
        }
        if (me.snapshot.status !== 'playing' || game.result) {
          return errorResult(`对局已经结束。\n\n${formatState(me.snapshot, me.you)}`);
        }
        if (!me.you.seat || me.you.seat !== game.turn) {
          return errorResult(
            `现在不是你的回合，轮到${sideLabel(game.turn)}。请调用 wait_for_update 等待。\n\n${formatState(me.snapshot, me.you)}`,
          );
        }
        return textResult(formatLegalMoves(game.legalMoves, from));
      }),
  );

  server.registerTool(
    'make_move',
    {
      title: '走子',
      description:
        '按 UCCI 坐标走子：from 与 to 各取两位，例如炮二平五为 from=h2、to=e2。只能从合法着法中选择，且必须轮到你。',
      inputSchema: z.object({
        from: SQUARE.describe('起点，例如 h2'),
        to: SQUARE.describe('终点，例如 e2'),
      }),
    },
    async ({ from, to }) =>
      guarded(async () => {
        const token = requireToken();
        if (!token) {
          return errorResult('尚未落座。请先调用 join_game。');
        }
        const result = await apiMove(token, from, to);
        syncSession(session, result.snapshot);
        const suffix = result.duplicate ? '（重复提交，已按已落子处理）' : '';
        const check = result.record.check ? '，将军！' : '';
        return textResult(
          `已走子：${from}→${to}${check}${suffix}\n\n${formatState(result.snapshot, session.you)}`,
        );
      }),
  );

  server.registerTool(
    'wait_for_update',
    {
      title: '等待棋局变化',
      description:
        '长轮询等待。默认等到轮到你或对局结束（untilYourTurn=true），也可靠 false 等待任意变化。超时是正常结果，不是错误；再次调用即可继续等待。',
      inputSchema: z.object({
        afterVersion: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe('只等待此版本之后的变化；省略则使用本进程已知版本'),
        untilYourTurn: z
          .boolean()
          .optional()
          .describe('是否等到轮到你或对局结束；默认 true'),
        timeoutMs: z
          .number()
          .int()
          .min(1000)
          .max(30000)
          .optional()
          .describe('等待毫秒数，默认 15000，最大 30000'),
      }),
    },
    async ({ afterVersion, untilYourTurn, timeoutMs }) =>
      guarded(async () => {
        const token = requireToken();
        if (!token) {
          return errorResult('尚未落座。请先调用 join_game。');
        }
        const until = untilYourTurn ?? true;
        const timeout = Math.min(30_000, Math.max(1000, Math.floor(timeoutMs ?? 15_000)));
        const after = afterVersion ?? session.lastVersion ?? undefined;
        const result = await apiWait(token, after, until, timeout);
        session.you = result.you;
        syncSession(session, result.snapshot);

        const prefix = result.timedOut
          ? '等待超时：暂时没有需要你行动的变化。可再次调用 wait_for_update 继续等待。'
          : '状态已更新。';
        return textResult(`${prefix}\n\n${formatState(result.snapshot, result.you)}`);
      }),
  );

  server.registerTool(
    'resign_game',
    {
      title: '认输',
      description: '当前对局中认输，由对方获胜。',
      inputSchema: z.object({}),
    },
    async () =>
      guarded(async () => {
        const token = requireToken();
        if (!token) {
          return errorResult('尚未落座。请先调用 join_game。');
        }
        const result = await apiResign(token);
        syncSession(session, result.snapshot);
        const resultLine = result.snapshot.game?.result
          ? `结果：${resultSummary(result.snapshot.game.result)}\n\n`
          : '';
        return textResult(`已认输。\n${resultLine}${formatState(result.snapshot, session.you)}`);
      }),
  );

  server.registerTool(
    'leave_game',
    {
      title: '离席',
      description:
        '离席并释放座位。仅在对局外可用；对局进行中请先调用 resign_game 认输。',
      inputSchema: z.object({}),
    },
    async () =>
      guarded(async () => {
        const token = requireToken();
        if (!token) {
          return errorResult('尚未落座。');
        }
        const result = await apiLeave(token);
        forget(session);
        return textResult(`已离席。\n\n${formatState(result.snapshot, null)}`);
      }),
  );

  return server;
}

serveStdio(createServer);
