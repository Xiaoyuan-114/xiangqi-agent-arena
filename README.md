# 中国象棋 · Agent Arena

一个本地运行的中国象棋对弈室：人类玩家可以通过网页与 Agent 对弈，也可以双人对弈、两个 Agent 对弈（人类观战）。

Agent 通过 MCP stdio 接入，适用于 Qoder、Claude Code、Cursor 等支持 MCP 的本地 harness。

## 功能

- 准备开始房间：Agent 可先入座并准备，人类后落座、点击准备，双方就绪后自动开局
- 三种模式由两席占用者自然组合：双人对战、人机对战、Agent 对战
- 实时棋局同步、合法落点提示、最近着法高亮、棋谱、认输、结果与再来一局
- 标准中国象棋规则：将军/将死、困毙判负、飞将限制、三次重复局面判和
- 经典木质棋盘与中文棋子界面，支持人类执黑时翻转视角
- Agent 使用 MCP 工具入座、准备、等待、走子、认输、离席

## 快速开始

要求 Node.js 24 及以上。

```bash
npm install
npm run dev
```

浏览器打开：`http://127.0.0.1:5173`

生产模式：

```bash
npm run build
npm start
```

浏览器打开：`http://127.0.0.1:8787`

服务默认只监听 `127.0.0.1`，房间数据只保存在内存中。可用环境变量调整：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `XIANGQI_PORT` | `8787` | 对局服务端口 |
| `XIANGQI_HOST` | `127.0.0.1` | 监听地址 |
| `XIANGQI_WEB_DIR` | `./dist/web` | 生产静态文件目录 |
| `XIANGQI_SERVER_URL` | `http://127.0.0.1:8787` | MCP 进程连接的对局服务地址 |
| `XIANGQI_AGENT_NAME` | `AI Agent` | Agent 默认显示名 |
| `XIANGQI_CLIENT_KEY` | 随机值 | 可选，固定后可在 MCP 进程重启后尝试恢复原座位 |

## 对局流程

### 人和 Agent 对弈（推荐）

1. 启动对局服务：`npm run dev`（或生产模式 `npm run build && npm start`）。
2. 在 harness 中配置本文下方的 xiangqi MCP 服务器，并新开一个会话让工具生效。
3. 让 Agent 入局，例如对它说：

   > 使用 xiangqi MCP 工具加入棋局，执黑并准备。之后循环等待和走子，直到对局结束。

   Agent 会调用 `join_game` 落座、`set_ready` 准备，然后等待。
4. 人类打开网页，会看到 Agent 已就座（可能已准备）。选择另一个空位落座，填写名字并点击“准备”。
5. 双方准备后自动开局，Agent 通过 `wait_for_update` 接到轮次，网页实时显示棋局。

### 双人对弈

用两个浏览器标签页或两台设备打开同一地址。每个标签页有独立的座位身份（token 存在 `sessionStorage`），分别落座红黑双方并点击准备即可。

### Agent 对 Agent

需要两个独立的 MCP 进程，例如：

- 两个不同的 harness（Qoder + Claude Code），各自配置 xiangqi MCP；或
- 同一 harness 中配置两个不同的 MCP server 条目（每个条目会启动一个独立进程），并通过不同的 `XIANGQI_AGENT_NAME` / `XIANGQI_CLIENT_KEY` 区分。

两个 Agent 分别落座并准备后自动开局。人类打开网页时若两席已满且对局进行中，会以观战身份查看棋盘。

> 一个 MCP 进程只代表一位 Agent。若某个 harness 让多个聊天共享同一个 MCP 进程，那些聊天会共用同一个座位；请改用两个条目或两个 harness。

### 再来一局与离席

- 对局结束后座位保留，人类点“再来一局”、Agent 调用 `set_ready(true)`，双方都准备后以相同颜色开新局。
- 对局中不能离席，需要先认输；对局外可离席，座位随即空出。
- 断线或 Agent 进程退出不会自动判负，也不会自动释放座位。卡住时由已落座的人类点击右上角“重置房间”；若两席都是 Agent，重启服务即可清空。
- 服务重启后房间与 token 全部清空，网页回到落座页，Agent 需要重新调用 `join_game`。

## MCP 接入

MCP 服务器是一个独立进程，通过内部 HTTP 连接对局服务。修改代码后需要重新运行 `npm run build`，确保 `dist/mcp/index.js` 是最新版。

### Qoder

在 Qoder 的 MCP 服务器设置中添加一个 stdio 服务器：

- 命令：`node`
- 参数：`E:\codes\中国象棋\dist\mcp\index.js`（替换为你的实际项目路径）
- 环境变量：
  - `XIANGQI_SERVER_URL=http://127.0.0.1:8787`
  - `XIANGQI_AGENT_NAME=Qoder`

保存后新开一个会话，让 MCP 工具加载。确认工具列表中出现 `join_game`、`set_ready`、`make_move` 等。

### Claude Code

项目根目录已包含 `.mcp.json`。在对局服务运行且已构建的情况下，于项目目录启动 Claude Code 并批准该 MCP 服务器即可。

如果 harness 的工作目录不是项目根目录，把 `args` 改成绝对路径：

```json
{
  "mcpServers": {
    "xiangqi": {
      "command": "node",
      "args": ["E:/codes/中国象棋/dist/mcp/index.js"],
      "env": {
        "XIANGQI_SERVER_URL": "http://127.0.0.1:8787",
        "XIANGQI_AGENT_NAME": "Claude"
      }
    }
  }
}
```

也可以使用命令行添加：

```bash
claude mcp add xiangqi -- node E:/codes/中国象棋/dist/mcp/index.js
```

### Cursor / 其他 harness

使用同样的 stdio 配置：`command=node`，`args=[dist/mcp/index.js 的绝对路径]`，环境变量至少包含 `XIANGQI_SERVER_URL`。Cursor 可写入项目 `.cursor/mcp.json` 或用户级 MCP 设置。

### 给 Agent 的持续对弈提示

`wait_for_update` 默认等待 15 秒，超时是正常结果，不是错误。建议给 Agent 明确指令：

> 使用 xiangqi MCP 工具。先 join_game 入座（执黑，名字 Qoder），再 set_ready(true)。之后不断循环：wait_for_update 等待轮到你 → 从 get_game_state 的合法着法中选择 → make_move 走子，直到 status 为 finished。超时就继续调用 wait_for_update，不要中途停止。

### MCP 工具

| 工具 | 作用 |
| --- | --- |
| `join_game` | 入座，可指定 `side=red/black/any` 和显示名 |
| `set_ready` | 准备/取消准备；局后调用 true 即再来一局 |
| `get_game_state` | 查看房间、座位、棋盘、FEN、最近着法与合法着法 |
| `list_legal_moves` | 列出当前回合合法着法，可按起点过滤 |
| `make_move` | 按 `from` / `to` 走子，例如 `h2` → `e2` |
| `wait_for_update` | 长轮询等待轮到你或对局变化 |
| `resign_game` | 认输 |
| `leave_game` | 对局外离席；对局中需先认输 |

工具输出包含 ASCII 棋盘与 FEN，错误信息会返回当前合法着法，便于模型自行纠正。

## 坐标约定

- 列 `a-i`：红方视角从左到右
- 行 `0-9`：从红方底线向上
- 红帅在 `e0`，黑将在 `e9`
- 着法使用 UCCI 形式：`from` + `to`，如炮二平五为 `h2e2`

初始 FEN：

```text
rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1
```

## 规则与限制

规则：

- 完整走子规则：马腿、象眼、象不过河、炮架、九宫、兵卒过河横走、飞将
- 将军、将死；困毙（无子可动且未被将军）判负
- 认输；同一局面第三次出现判和
- 不实现长将判负等完整竞赛规则；不设棋钟、和棋提议、悔棋

限制：

- 单房间，同一时刻只能进行一局；模式随座位占用者切换
- 仅内存持久化，服务重启即清空
- 本地使用，没有账号系统；不要直接把服务暴露到公网
- 浏览器座位 token 存在当前标签页的 `sessionStorage`；关闭标签页后座位不会自动释放，需要重置房间
- Agent 进程退出不会自动判负或释放座位，避免模型思考超时被误判

## 开发

```bash
npm run typecheck   # TypeScript 检查
npm test            # 规则、房间、HTTP API、MCP Agent 对 Agent 测试
npm run build       # 构建前端、服务端和 MCP
npm run smoke:mcp   # 构建并检查 MCP 工具是否注册
```

主要目录：

```text
src/shared/engine/   纯 TypeScript 象棋规则引擎
src/server/          单房间状态机、HTTP API、SSE、长轮询
src/mcp/             MCP stdio 服务器与内部 HTTP 客户端
src/web/             React 准备室与棋盘界面
tests/               规则、房间、API、MCP 端到端测试
```

## 故障排查

- **MCP 工具没有出现**：确认已运行 `npm run build`、对局服务已启动、配置中的路径正确，并新开 harness 会话。MCP 工具不会在已打开的会话中热加载。
- **提示会话失效（SESSION_EXPIRED）**：服务重启或房间被重置，重新调用 `join_game`。
- **Agent 不走棋**：`wait_for_update` 超时后需要再次调用；若 Agent 已停止，在对话中让它继续，或重新提示对局流程。
- **房间卡住 / 无法重新落座**：已落座的人类使用右上角“重置房间”；若两席都是 Agent，重启服务。
- **改了端口**：设置 `XIANGQI_PORT` 后，开发模式的 Vite 代理仍指向 8787，需要同步修改 `vite.config.ts` 的代理地址，或使用生产模式。
- **生产页面 404**：从项目根目录运行 `npm start`，或通过 `XIANGQI_WEB_DIR` 指定构建后的前端目录。

## 仓库

GitHub：<https://github.com/Xiaoyuan-114/xiangqi-agent-arena>
