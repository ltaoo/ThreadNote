# 统一能力入口架构

ThreadNote 的领域能力由 `internal/service` 中的 `CapabilityService` 统一注册。HTTP、桌面 Bridge、CLI、JSON-RPC 和 MCP 都是协议适配器，不在适配器中重新实现 Memo、Task 等业务规则。

```text
                          CapabilityDefinition + Invoke
                                      │
                ┌─────────────────────┴─────────────────────┐
                │         internal/service                  │
                │  Project · Memo · Task · Milestone · Board│
                └───┬──────────┬──────────┬──────────┬──────┘
                    │          │          │          │
              Bridge API   REST API      CLI      JSON-RPC / MCP
```

## 架构约束

1. 一个领域操作只注册一次能力名称、输入 JSON Schema、副作用标记和处理函数。
2. `CapabilityService.Invoke` 是所有通用入口的唯一调用契约。
3. 新增可自动化的领域 API 时，必须先加入能力目录；REST、CLI、JSON-RPC 和 MCP 会由同一目录获得发现与调用能力。
4. 窗口显示、文件选择器、剪贴板、应用更新等只在桌面进程中成立的操作属于平台适配器 API，不进入领域能力目录。
5. 独立进程通过 `--vault` 固定 Vault；未指定时读取 `~/.velo/data.json` 中最后活动的 Vault。进程不会切换桌面应用当前打开的 Vault。

当前目录包含 56 个能力，覆盖 Vault 状态、Project、Memo、Memo/评论版本历史、Memo Comment、Memo Draft、隐私锁、Task、Task Note、Milestone、Board、Webhook 配置、代码片段和链接搜索。Task 的需求池阶段通过 `stage:backlog` 等 tag 表达，不存在独立 GTDItem 能力。

## CLI

根二进制保留无参数启动桌面的行为；带 `cli` 子命令时调用统一能力。

```bash
# 能力发现
go run . cli --vault /absolute/path/to/vault capabilities

# 获取 Memo 列表
go run . cli --vault /absolute/path/to/vault memo list

# 创建 Memo
go run . cli --vault /absolute/path/to/vault \
  --input '{"content":"通过 CLI 创建 #inbox"}' memo create

# 从 stdin 读取参数
printf '%s' '{"title":"澄清导出需求","tags":["stage:backlog"]}' |
  go run . cli --vault /absolute/path/to/vault --input - task create
```

命令也接受完整能力名，例如 `call memo.list`。成功结果写入 stdout，错误写入 stderr；脚本可依赖退出码和 JSON 输出。

## CLI JSON-RPC

`jsonrpc` 子命令在 stdio 上使用一行一个消息的 JSON-RPC 2.0：

```bash
go run . jsonrpc --vault /absolute/path/to/vault
```

支持的方法：

- `rpc.ping`
- `rpc.discover` 或 `capabilities/list`
- `capabilities/call`，参数为 `{"name":"memo.list","input":{}}`
- 直接使用能力名，例如方法 `memo.list`，`params` 就是能力输入

## 独立 MCP Server

可单独构建不启动桌面 UI 的 MCP Server：

```bash
go build -o threadnote-mcp ./cmd/threadnote-mcp
./threadnote-mcp --vault /absolute/path/to/vault
```

MCP Host 配置示例：

```json
{
  "mcpServers": {
    "threadnote": {
      "command": "/absolute/path/to/threadnote-mcp",
      "args": ["--vault", "/absolute/path/to/vault"]
    }
  }
}
```

Server 使用 stdio transport，支持 MCP 2026-07-28 的 `server/discover`，也兼容使用 `initialize` 的旧客户端。能力定义直接映射为 MCP tools，领域错误通过 `tools/call` 的 `isError: true` 返回。

## 通过 Bridge 启动 MCP Server

桌面进程可以通过 Bridge 启动一个嵌入式 Streamable HTTP MCP Server。它复用桌面当前活动 Vault 和统一能力目录；切换 Vault 后，后续 tool call 会使用新的活动 Vault。

| Bridge API | 方法 | 说明 |
| --- | --- | --- |
| `/api/mcp/status` | GET | 查询运行状态、地址和 MCP URL |
| `/api/mcp/start` | POST | 启动服务；重复调用不会重复监听 |
| `/api/mcp/stop` | POST | 停止服务 |

前端调用示例：

```js
const started = await globalThis.invoke("/api/mcp/start", {
  method: "POST",
  args: {
    address: "127.0.0.1:18089",
    token: "optional-bearer-token",
    allowedOrigins: ["http://127.0.0.1:3000"],
  },
});

const status = await globalThis.invoke("/api/mcp/status", { method: "GET" });
await globalThis.invoke("/api/mcp/stop", { method: "POST", args: {} });
```

默认监听 `127.0.0.1:18089`，MCP endpoint 为 `http://127.0.0.1:18089/mcp`。非回环监听地址必须提供 `token`；状态接口只返回 `authEnabled`，不会回传 Token。应用退出时会自动停止嵌入式服务。

HTTP MCP 请求示例：

```bash
curl -X POST http://127.0.0.1:18089/mcp \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer optional-bearer-token' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## HTTP API

桌面 Bridge 与本机 REST 都暴露统一目录：

| 入口 | 发现 | 调用 |
| --- | --- | --- |
| Velo Bridge | `GET /api/capabilities` | `POST /api/capabilities/call` |
| REST | `GET /api/capabilities` | `POST /api/capabilities/<name>` 或 `POST /api/capabilities/call` |

REST 示例：

```bash
curl http://127.0.0.1:18088/api/capabilities

curl -X POST http://127.0.0.1:18088/api/capabilities/memo.create \
  -H 'Content-Type: application/json' \
  -d '{"content":"通过 API 创建"}'
```

配置了 `DEMO_DESKTOP_API_TOKEN` 时，统一能力端点与兼容 REST 路由使用相同认证中间件。

## 新增能力

领域文件与能力适配文件保持一一对应，例如：

- `memo.go` / `capability_memo.go`
- `task.go` / `capability_task.go`
- `gtd_milestone.go` / `capability_milestone.go`
- `board.go` / `capability_board.go`

新增能力时需要提供稳定名称、输入类型、必填字段、副作用 annotations 和处理函数，并在目录测试中验证排序、唯一性和至少一个实际调用。协议适配器不需要增加 switch 分支。
