# ThreadNote

<p align="center">
  <img src="assets/threadnote-logo.png" width="160" alt="ThreadNote 图标">
</p>

ThreadNote 是一个本地优先的桌面知识与任务工作台。它以 Markdown Memo 为核心，把随手记录、双向引用、项目归档、独立任务、GTD、看板、附件和自动化整合在同一个本地 Vault 中。

用户可见的应用名、窗口标题、安装包名和平台元数据均使用 **ThreadNote**。已有的 `demo-desktop:*` 本地存储键和 `DEMO_DESKTOP_API_*` 环境变量仅为兼容旧数据与脚本而保留，不会作为界面标题显示。

应用使用 Go 与 [Velo](https://github.com/ltaoo/velo) 提供桌面壳和原生能力，前端由原生 ES Modules 驱动，并随 Go 二进制一同嵌入。日常使用不依赖数据库服务，主要数据直接保存在用户选择的目录中，便于备份、迁移和使用其他工具读取。

## 功能概览

### Memo 与知识组织

- 使用 Markdown 创建、编辑、置顶、归档和搜索 Memo。
- 通过 Vault 和 Project 组织内容，支持标签、可见性和私密内容 PIN 锁定。
- 支持 `[[memo]]` 双向引用、嵌入、反向链接和行范围引用。
- 从正文聚合任务、超链接、代码片段、文件和图片。
- 支持评论、回复、表情反应、草稿自动保存以及 Memo/评论版本历史与恢复。
- 可将 Memo 分离为独立窗口，也可使用时间线、精简 Memo 和精简待办窗口。

### 任务、GTD 与看板

- 独立任务模型支持状态、优先级、清单、项目、标签、上下文、子任务、日期、提醒、重复规则和关联笔记。
- Markdown 中的任务行可以同步或提取为独立任务。
- 待澄清、待判断或待分解的需求也是 Task，通过 `stage:backlog` 等标签表达任务阶段；类型可使用 `type:idea`、`type:bug`、`type:feature` 等标签。
- Milestones 用于管理阶段目标，并通过 `taskIds` 关联任务。
- 看板支持自定义列、内置流程模板和任务创建规则。

### 资源与自动化

- 支持本地存储及 S3 兼容对象存储，用于图片与附件上传、预览和管理。
- 自动识别 Memo 与评论中的代码片段和链接，提供全局快捷搜索入口。
- 支持任务和 Memo 事件 Webhook。
- 提供统一能力目录，可通过本机 REST API、CLI、JSON-RPC 和独立 MCP Server 管理 Memo、Task、Project、Milestone 与 Board。
- 可连接本机 ACP Agent；当前内置 OpenCode 启动配置，用于编辑选区和聊天。

### 桌面能力

- 原生目录/文件选择、拖放、剪贴板图片读写和外部应用打开。
- 主窗口与分离窗口状态持久化，启动时恢复未关闭窗口。
- 开机自启动、自动更新和按应用锁定输入法。
- macOS、Windows 和 Linux 的构建配置。

## 技术架构

```text
┌────────────────────────────────────────────────────────────┐
│ frontend/                                                  │
│ 原生 ES Modules · Timeless UI · ProseMirror · Markdown UI  │
└───────────────────────────┬────────────────────────────────┘
                            │ globalThis.invoke / Velo Bridge
┌───────────────────────────▼────────────────────────────────┐
│ internal/desktopapp/ · 稳定桌面入口                         │
├────────────────────────────────────────────────────────────┤
│ internal/service/                                          │
│ 领域服务 · 统一能力目录 · 窗口管理 · 系统能力 · 定时提醒    │
└──────┬───────────┬────────────┬──────────────┬─────────────┘
       │           │            │              │
 Bridge API    REST API        CLI        JSON-RPC / MCP
       │           │            │              │
┌──────▼───────────▼────────────▼──────────────▼─────────────┐
│ Vault 与外部集成                                           │
├──────────────────────┬─────────────────────┬───────────────┤
│ 本地 Vault           │ S3 兼容对象存储      │ ACP / Webhook │
│ Markdown + JSON      │ 可选                 │ 可选          │
└──────────────────────┴─────────────────────┴───────────────┘
```

主要技术：

- Go 1.24
- Velo 1.1.1，Bridge 模式桌面 WebView
- 原生 JavaScript ES Modules
- ProseMirror 编辑器与可选 Vim 模式
- AWS SDK for Go v2（S3 兼容存储）
- ACP/NDJSON 客户端（本机 Agent 集成）

前端没有业务代码打包步骤；`frontend/` 会由 `main.go` 使用 `go:embed` 直接打入程序。`frontend/package.json` 当前只提供 ESLint 开发依赖。

## 快速开始

### 环境要求

- Go 1.24 或更高版本
- macOS 11 或更高版本（macOS 构建与运行）
- 当前平台可用的 C/C++ 编译工具链和 Velo 所需原生 WebView 环境
- Node.js/npm（可选，仅用于前端 lint）
- OpenCode（可选，仅在使用 ACP Chat 或 Memo Agent 时需要）

### 运行开发版本

```bash
go mod download
go run .
```

首次启动后：

1. 选择一个已存在且可写的本地目录作为 Vault。
2. ThreadNote 会在其中创建 `.velo/`、`memo/`、`memo-comments/` 等工作目录。
3. 进入 Inbox 后即可创建 Memo、Project 和任务。

前端文件被嵌入到 Go 程序中，修改 `frontend/` 后需要重新启动 `go run .` 才能看到结果。

### 运行测试

```bash
go test ./...
```

### 前端 lint

```bash
cd frontend
npm ci
npm run lint
```

当前 lint 脚本只检查 `frontend/index.js`；扩展检查范围时请同步调整 `frontend/package.json`。

## 构建

直接构建当前平台的二进制：

```bash
go build -ldflags "-X main.Version=1.0.0 -X main.Mode=release" -o ThreadNote .
```

使用与项目依赖匹配的 Velo CLI 生成平台包：

```bash
go install github.com/ltaoo/velo/cmd/velo@v1.1.1
MACOSX_DEPLOYMENT_TARGET=11.0 velo build
```

`velo build` 会读取根目录的 `velo.json`，以 `assets/` 中的源素材生成平台配置和发布产物。其中 `.build/` 与 `dist/` 均为可再生目录，不纳入版本控制；`build/` 仅作为 Velo 1.0.0 及更早版本的遗留目录继续忽略。正式发布前请确认包名、签名、更新源和厂商信息符合实际发布环境。

## 自动发布

推送符合 `v1.2.3` 或 `v1.2.3-beta.1` 格式的标签后，
[GitHub Actions](.github/workflows/release.yml) 会自动运行测试、构建当前可用平台的产物并创建 GitHub Release：

- macOS：arm64 / amd64 DMG
- Windows：amd64 ZIP（包含 `WebView2Loader.dll`）
- 全部产物的 `checksums.txt`

Velo 当前的 Linux WebView 仍是占位实现，因此工作流暂不发布不可运行的 Linux 桌面包；
上游补齐 Linux WebView 后再恢复 Linux 构建任务。

```bash
git tag v0.1.2
git push origin v0.1.2
```

macOS Developer ID 签名与公证是可选的。需要启用时，在仓库 Actions Secrets 中完整配置：
`APPLE_ID`、`APPLE_TEAM_ID`、`MAC_CERT_IDENTITY`、`MAC_CERT_P12_BASE64`、`MAC_CERT_PASSWORD`、
`APPLE_API_KEY_P8_BASE64`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER_ID`。
未完整配置时仍会生成包含 ad-hoc 签名 `ThreadNote.app` 的 DMG，并在镜像内附带首次运行说明。
这类构建未经 Apple 公证；安装到“应用程序”后，需要先执行以下命令移除 macOS 隔离属性，再打开应用：

```bash
xattr -dr com.apple.quarantine "/Applications/ThreadNote.app"
```

请只对从项目官方发布页下载的安装包执行此操作。

工作流使用 Velo v1.1.1，包含运行中应用更新、隔离属性清理、安全重启，以及避免在应用包内写入运行时存储的支持。

已安装的应用可在“设置 → 关于 → 更新”中手动检查版本。发现新版本后，点击“安装更新并重启”，ThreadNote 会按当前系统选择 GitHub Release 资产、校验 `checksums.txt` 中的 SHA-256、退出并释放本地资源，然后替换应用并重新启动。发布时必须同时上传平台安装包与 `checksums.txt`。

更新源按 `velo.json` 中的优先级依次尝试：开发测试时先请求
`http://127.0.0.1:8080/repos/ltaoo/ThreadNote/releases`，本地服务不可用或没有匹配平台的版本时自动回退到官方 GitHub Release。本地源仅允许 HTTPS，或用于开发测试的 `localhost` / 回环 HTTP；官方源仍强制校验 `checksums.txt`。

使用 `fakegithubrelease` 上传一个高于当前应用版本、且文件名包含当前平台（例如 `ThreadNote_0.1.2_darwin_arm64.dmg`）的 Release 后，可运行真实下载验收测试：

```bash
THREADNOTE_SELF_UPDATE_TEST=1 go test ./internal/service \
  -run '^TestConfiguredSelfHostedUpdateDownload$' -count=1 -v
```

## Vault 数据结构

典型 Vault 结构如下；部分目录和索引会在首次使用对应功能时创建：

```text
your-vault/
├── projects.json                # Project 列表（需同步）
├── .velo/
│   ├── vault.json               # Vault 身份与名称
│   ├── boards.json              # 看板及流程规则
│   ├── milestones.json          # 里程碑
│   ├── hooks.json               # Webhook 配置
│   ├── memo-drafts.json         # Memo 草稿
│   ├── task-index.json          # 任务索引
│   └── ...                      # Velo Store 与其他设置
├── memo/
│   └── YYYY/MM/*.md             # Memo 与同目录版本历史
├── memo-comments/
│   └── <memo-id>/YYYY/MM/*.md   # 评论与同目录版本历史
├── tasks/
│   ├── open/YYYY/MM/*.json
│   └── <status>/YYYY/*.json     # completed/cancelled/archived
└── storage/                     # 默认本地附件存储（启用时）
```

Memo 使用 YAML front matter 保存结构化元数据，正文保持为普通 Markdown。版本历史以相邻的 `*.history.json` 文件保存。任务使用独立 JSON 文件，因此数据无需专有数据库即可读取。旧版本的 `items/*.json` 会在打开 Vault 时迁移为 Task，原文件备份到 `.velo/migrations/items-to-tasks-v1/`。

本机 Vault 注册表位于 `~/.velo/data.json`，记录最近打开的 Vault 和当前活动 Vault。后端与前端结构化日志统一写入固定文件 `~/.myapp/app.log`；前端记录带有 `"component":"frontend"`，可用 `rg '"component":"frontend"' ~/.myapp/app.log` 快速筛选。

## 常用快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Cmd+Shift+M` | 显示主窗口（macOS） |
| `Cmd+Shift+H` | 隐藏主窗口（macOS） |
| `Ctrl+Shift+Space` / `Cmd+Shift+Space` | 打开代码片段/链接启动器 |
| `Ctrl+O` | 搜索 Memo、评论与代办，并分别在对应的分离窗口中打开，默认可在设置中修改 |

应用内还支持在设置中开启 Vim 模式、选择本地文件的默认打开应用，以及按文件后缀配置不同编辑器。

## 可选集成

### 本机 REST API

ThreadNote 默认在 `127.0.0.1:18088` 启动本机 API，提供健康检查、兼容的 Tasks/Milestones REST 路由，以及由统一能力目录生成的领域操作。Task 列表支持通过 `status`、`projectId`、`listId`、`tag` 和 `context` 查询参数筛选。

```bash
curl http://127.0.0.1:18088/api/health
curl 'http://127.0.0.1:18088/api/tasks?tag=stage%3Abacklog'
curl http://127.0.0.1:18088/api/capabilities
curl -X POST http://127.0.0.1:18088/api/capabilities/memo.create \
  -H 'Content-Type: application/json' \
  -d '{"content":"通过统一能力 API 创建"}'
```

可通过环境变量调整：

| 环境变量 | 说明 |
| --- | --- |
| `DEMO_DESKTOP_API_ENABLED` | 启用或停用 API |
| `DEMO_DESKTOP_API_ADDR` | 完整监听地址 |
| `DEMO_DESKTOP_API_PORT` | 仅覆盖本机监听端口 |
| `DEMO_DESKTOP_API_TOKEN` | Bearer Token 或 `X-Velo-API-Token` |

兼容的旧变量前缀为 `VELO_DEMO_API_*`。如果把监听地址改为非回环地址，务必同时设置 Token 并配置主机防火墙。

### CLI、JSON-RPC 与 MCP

无参数执行根二进制仍启动桌面应用；以下子命令复用同一领域能力目录：

```bash
go run . cli --vault /absolute/path/to/vault capabilities
go run . cli --vault /absolute/path/to/vault memo list
go run . cli --vault /absolute/path/to/vault --input '{"title":"新任务"}' task create
go run . jsonrpc --vault /absolute/path/to/vault
go run . mcp --vault /absolute/path/to/vault
```

独立 MCP 二进制可通过 `go build -o threadnote-mcp ./cmd/threadnote-mcp` 构建。桌面 Bridge 也支持通过 `/api/mcp/start`、`/api/mcp/status` 和 `/api/mcp/stop` 管理默认监听 `127.0.0.1:18089` 的 Streamable HTTP MCP Server。入口契约、Bridge 参数、MCP Host 配置和扩展规范见 [统一能力入口文档](docs/CAPABILITY_ENTRYPOINTS.md)。

### Webhook

可在“设置 → Webhook”中订阅 `task.created`、`task.completed`、`task.reopened`、`task.deleted` 和 Memo 创建、更新、删除事件。完整 Payload 与本地调试接收器用法见 [Webhook 文档](docs/webhook.md)。

启动示例接收器：

```bash
go run ./cmd/webhook-server
```

接收地址默认为 `http://127.0.0.1:8080/api/webhook`，可用 `PORT` 环境变量修改端口。

### ACP Agent

当前 Agent 管理器默认查找 `opencode` 命令，也会尝试 `~/.opencode/bin/opencode`。可使用 `VELO_OPENCODE_ACP_PATH` 指向自定义二进制；Agent 会以当前 Vault 根目录作为工作目录。

## 目录说明

```text
.
├── main.go                    # 应用入口与资源嵌入
├── velo.json                  # Velo 构建、平台和更新配置
├── internal/desktopapp/       # 稳定桌面入口及平台子包
├── internal/service/          # 按领域拆分的服务、Bridge API 与运行时
├── internal/clientsdk/        # ACP/JSON-RPC/NDJSON 客户端
├── frontend/                  # 页面、领域模块和静态运行时资源
├── cmd/webhook-server/        # Webhook 调试接收器
├── assets/                    # 应用图标与安装包素材
└── docs/                      # 使用与集成文档
```

构建时会按需生成 `.build/`（平台配置和图标）与 `dist/`（发布产物）；这些目录均已由 `.gitignore` 排除。

进一步阅读：

- [核心领域概念（包含部分早期实现说明）](docs/CORE_DOMAIN_CONCEPTS.md)
- [任务领域设计（独立任务模型演进方案）](docs/TODO_DOMAIN_DESIGN.md)
- [云文件预览设计](docs/CLOUD_FILE_PREVIEW_DESIGN.md)
- [Vim Ex 命令设计](frontend/VIM_EX_COMMAND_DESIGN.md)
- [Vim 模式上下文](frontend/VIM_MODE_CONTEXT.md)
- [Webhook 文档](docs/webhook.md)

## 开发注意事项

- 业务数据文件格式是产品接口的一部分，修改 front matter 或 JSON schema 时应提供兼容读取或迁移逻辑。
- Vault 是用户数据边界；不要把临时文件、构建产物或机器相关绝对路径写入 Vault 数据。
- 私密 Memo/任务在锁定时会通过 Bridge API 脱敏，但 Vault 文件本身不是全盘加密。PIN 使用 bcrypt 哈希保存，不应把该功能描述为磁盘加密。
- S3 凭据、Webhook 地址、自动更新源和本机 API 暴露范围都应在发布前完成安全审查。
- `velo.json` 使用当前 GitHub 仓库的 Release 作为更新源，并要求 SHA-256 校验。
