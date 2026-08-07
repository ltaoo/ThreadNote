# Webhook 文档

当 Velo 中发生任务或备忘录事件时，可配置 Webhook 将事件和完整数据 POST 到你的第三方服务。

## 请求格式

| 项目 | 值 |
|------|-----|
| **Method** | `POST` |
| **Content-Type** | `application/json` |
| **Body** | JSON，见下方 [Payload 结构](#payload-结构) |
| **超时** | 无明确超时，但建议接收端 5 秒内返回 `2xx` |

## 事件类型

### 任务事件

| 事件 | 触发时机 |
|------|---------|
| `task.created` | 任务创建成功后 |
| `task.completed` | 任务状态变为 `completed`（勾选完成） |
| `task.reopened` | 已完成/已取消任务重新打开（状态变为 `open`） |
| `task.deleted` | 任务被删除 |

### 备忘录事件

| 事件 | 触发时机 |
|------|---------|
| `memo.created` | 备忘录创建成功后 |
| `memo.updated` | 备忘录内容或属性修改后 |
| `memo.deleted` | 备忘录被删除 |

## Payload 结构

Payload 根据事件类型包含 `task` 或 `memo` 对象，两者不会同时出现。

### 任务事件 Payload

```json
{
  "event": "task.created",
  "task": {
    "id": "task_20260101T120000_a1b2c3",
    "title": "任务标题",
    "status": "open",
    "priority": "none",
    "tags": ["Todo"],
    "boardId": "board_xxx",
    "projectId": "proj_xxx",
    "listId": "inbox",
    "contexts": [],
    "createdAt": "2026-01-01T12:00:00.000Z",
    "updatedAt": "2026-01-01T12:00:00.000Z",
    "dueAt": "2026-01-15",
    "startAt": "",
    "completedAt": "",
    "cancelledAt": "",
    "notes": "",
    "parentId": "",
    "subtaskIds": [],
    "links": [],
    "noteRefs": [],
    "reminders": [],
    "repeat": { "frequency": "", "interval": 0, "weekdays": [] },
    "source": { "type": "", "memoId": "", "memoPath": "", "line": 0 },
    "private": false,
    "visibility": "default",
    "timezone": "UTC",
    "path": "tasks/open/2026/01/task_xxx.json",
    "schemaVersion": 1
  }
}
```

### 备忘录事件 Payload

```json
{
  "event": "memo.created",
  "memo": {
    "id": "memo_20260101T120000_a1b2c3",
    "content": "# 会议纪要\n\n讨论内容...",
    "createdAt": "2026-01-01T12:00:00.000Z",
    "updatedAt": "2026-01-01T12:00:00.000Z",
    "kind": "",
    "pinned": false,
    "archived": false,
    "private": false,
    "projectId": "my-project",
    "taskId": "",
    "tags": ["meeting"],
    "references": [],
    "reactions": [],
    "locations": [],
    "visibility": "PRIVATE",
    "path": "my-project/2026/01/memo_20260101T120000_a1b2c3.md"
  }
}
```

## Task 字段说明

### 核心字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 任务唯一 ID，格式 `task_<时间戳>_<随机>` |
| `title` | string | 任务标题 |
| `status` | string | 状态：`"open"` / `"completed"` / `"cancelled"` / `"archived"` |
| `priority` | string | 优先级：`"none"` / `"low"` / `"medium"` / `"high"` / `"urgent"` |
| `tags` | string[] | 标签列表，包含看板列标签（如 `"Todo"`、`"Doing"`、`"Done"`） |
| `notes` | string | 备注内容（Markdown） |

### 归属字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `boardId` | string | 所属看板 ID，空字符串表示不在任何看板 |
| `projectId` | string | 所属项目 ID，空字符串表示未分配项目 |
| `listId` | string | 所属清单 ID，默认 `"inbox"` |
| `parentId` | string | 父任务 ID（子任务场景），空字符串表示顶级任务 |
| `subtaskIds` | string[] | 子任务 ID 列表 |

### 时间字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `createdAt` | string | 创建时间，RFC3339 格式 |
| `updatedAt` | string | 最后更新时间，RFC3339 格式 |
| `dueAt` | string | 截止日期，格式 `YYYY-MM-DD`，空字符串表示无截止 |
| `startAt` | string | 开始日期，格式 `YYYY-MM-DD` |
| `completedAt` | string | 完成时间，RFC3339 格式 |
| `cancelledAt` | string | 取消时间，RFC3339 格式 |

### 其他字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `contexts` | string[] | 上下文标签 |
| `visibility` | string | 可见性：`"default"` / `"private"` / `"public"` |
| `private` | bool | 是否为私有任务 |
| `timezone` | string | 时区，默认 `"UTC"` |
| `path` | string | 任务文件在 vault 中的相对路径 |

### 复合字段

**`links`** — 关联链接
```json
[
  { "url": "https://...", "title": "链接标题" }
]
```

**`noteRefs`** — 关联备注引用
```json
[
  { "memoId": "memo_xxx", "memoPath": "path/to/memo.md" }
]
```

**`reminders`** — 提醒配置
```json
[
  {
    "type": "due",         // "due" | "absolute" | "offset"
    "at": "2026-01-15T09:00:00Z",
    "base": "dueAt",
    "offsetMinutes": -30,
    "fired": false
  }
]
```

**`repeat`** — 重复规则
```json
{
  "frequency": "weekly",   // "" | "daily" | "weekly" | "monthly" | "yearly"
  "interval": 1,
  "weekdays": ["monday"],
  "end": {
    "type": "",            // "" | "at" | "count"
    "at": "",
    "count": 0
  }
}
```

**`source`** — 来源信息（从 memo 行同步的任务）
```json
{
  "type": "memo",          // "" | "memo" | "comment"
  "memoId": "memo_xxx",
  "memoPath": "project/memo.md",
  "commentId": "",
  "commentPath": "",
  "line": 42,
  "text": "- [ ] 原始行文本"
}
```

## Memo 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 备忘录唯一 ID，格式 `memo_<时间戳>_<随机>` |
| `content` | string | 备忘录正文（Markdown） |
| `createdAt` | string | 创建时间，RFC3339 格式 |
| `updatedAt` | string | 最后更新时间，RFC3339 格式 |
| `kind` | string | 类型标记，空字符串表示普通 memo |
| `pinned` | bool | 是否置顶 |
| `archived` | bool | 是否归档 |
| `private` | bool | 是否为私有 memo |
| `projectId` | string | 所属项目 ID，空字符串表示未分配 |
| `taskId` | string | 关联任务 ID，空字符串表示无关联 |
| `tags` | string[] | 标签列表 |
| `references` | string[] | 引用的其他 memo ID 列表 |
| `reactions` | string[] | 表情反应列表 |
| `locations` | string[] | 提取的地理位置 |
| `visibility` | string | 可见性：`"PRIVATE"` / `"PROTECTED"` / `"PUBLIC"` |
| `path` | string | 备忘录文件在 vault 中的相对路径 |

## 实际 Payload 示例

### 示例 1：创建任务

用户从快速入口创建了一个简单任务：

```json
{
  "event": "task.created",
  "task": {
    "id": "task_20260803T080000_x1y2z3",
    "title": "买牛奶",
    "status": "open",
    "priority": "none",
    "tags": [],
    "boardId": "",
    "projectId": "",
    "listId": "inbox",
    "contexts": [],
    "createdAt": "2026-08-03T08:00:00.000Z",
    "updatedAt": "2026-08-03T08:00:00.000Z",
    "dueAt": "",
    "startAt": "",
    "completedAt": "",
    "cancelledAt": "",
    "notes": "",
    "parentId": "",
    "subtaskIds": [],
    "links": [],
    "noteRefs": [],
    "reminders": [],
    "repeat": { "frequency": "", "interval": 0, "weekdays": [] },
    "source": { "type": "", "memoId": "", "memoPath": "", "line": 0 },
    "private": false,
    "visibility": "default",
    "timezone": "UTC",
    "path": "tasks/open/2026/08/task_20260803T080000_x1y2z3.json",
    "schemaVersion": 1
  }
}
```

### 示例 2：完成任务

用户勾选完成任务，webhook 发送 `task.completed` 事件：

```json
{
  "event": "task.completed",
  "task": {
    "id": "task_20260803T080000_x1y2z3",
    "title": "买牛奶",
    "status": "completed",
    "priority": "none",
    "tags": ["Done"],
    "boardId": "board_xxx",
    "projectId": "",
    "listId": "inbox",
    "contexts": [],
    "createdAt": "2026-08-03T08:00:00.000Z",
    "updatedAt": "2026-08-03T08:30:00.000Z",
    "dueAt": "",
    "startAt": "",
    "completedAt": "2026-08-03T08:30:00.000Z",
    "cancelledAt": "",
    "notes": "",
    "parentId": "",
    "subtaskIds": [],
    "links": [],
    "noteRefs": [],
    "reminders": [],
    "repeat": { "frequency": "", "interval": 0, "weekdays": [] },
    "source": { "type": "", "memoId": "", "memoPath": "", "line": 0 },
    "private": false,
    "visibility": "default",
    "timezone": "UTC",
    "path": "tasks/completed/2026/08/task_20260803T080000_x1y2z3.json",
    "schemaVersion": 1
  }
}
```

### 示例 3：撤销完成任务

用户取消勾选，任务重新打开，webhook 发送 `task.reopened` 事件：

```json
{
  "event": "task.reopened",
  "task": {
    "id": "task_20260803T080000_x1y2z3",
    "title": "买牛奶",
    "status": "open",
    "completedAt": "",
    "...": "..."
  }
}
```

### 示例 4：创建备忘录

用户在项目中创建了一篇会议纪要：

```json
{
  "event": "memo.created",
  "memo": {
    "id": "memo_20260803T140000_a1b2c3",
    "content": "# Sprint 回顾\n\n- 完成了登录模块\n- 修复了 3 个 bug\n",
    "createdAt": "2026-08-03T14:00:00.000Z",
    "updatedAt": "2026-08-03T14:00:00.000Z",
    "kind": "",
    "pinned": false,
    "archived": false,
    "private": false,
    "projectId": "my-project",
    "taskId": "",
    "tags": ["meeting", "sprint"],
    "references": [],
    "reactions": [],
    "locations": [],
    "visibility": "PRIVATE",
    "path": "my-project/2026/08/memo_20260803T140000_a1b2c3.md"
  }
}
```

### 示例 5：修改备忘录

用户更新了备忘录内容：

```json
{
  "event": "memo.updated",
  "memo": {
    "id": "memo_20260803T140000_a1b2c3",
    "content": "# Sprint 回顾\n\n- 完成了登录模块\n- 修复了 3 个 bug\n- **决定：下周开始性能优化**\n",
    "createdAt": "2026-08-03T14:00:00.000Z",
    "updatedAt": "2026-08-03T15:00:00.000Z",
    "tags": ["meeting", "sprint", "performance"],
    "...": "..."
  }
}
```

### 示例 6：有项目、看板和标签的复杂任务

用户在项目上下文中创建任务，自动被看板规则分配标签和列：

```json
{
  "event": "task.created",
  "task": {
    "id": "task_20260803T080500_a9b8c7",
    "title": "修复登录页面样式",
    "status": "open",
    "priority": "high",
    "tags": ["Todo"],
    "boardId": "board_20260801T000000_d6e5f4",
    "projectId": "my-project",
    "listId": "",
    "contexts": ["frontend"],
    "createdAt": "2026-08-03T08:05:00.000Z",
    "updatedAt": "2026-08-03T08:05:00.000Z",
    "dueAt": "2026-08-10",
    "startAt": "2026-08-03",
    "completedAt": "",
    "cancelledAt": "",
    "notes": "需要适配移动端",
    "parentId": "",
    "subtaskIds": [],
    "links": [
      { "url": "https://github.com/org/repo/issues/42", "title": "#42" }
    ],
    "noteRefs": [],
    "reminders": [
      { "type": "due", "at": "2026-08-10T09:00:00Z", "base": "dueAt", "offsetMinutes": 0, "fired": false }
    ],
    "repeat": { "frequency": "", "interval": 0, "weekdays": [] },
    "source": { "type": "", "memoId": "", "memoPath": "", "line": 0 },
    "private": false,
    "visibility": "default",
    "timezone": "Asia/Shanghai",
    "path": "tasks/open/2026/08/task_20260803T080500_a9b8c7.json",
    "schemaVersion": 1
  }
}
```

## 接收端实现参考

### Python (Flask)

```python
from flask import Flask, request

app = Flask(__name__)

@app.route("/velo-webhook", methods=["POST"])
def velo_webhook():
    payload = request.get_json()
    event = payload["event"]
    task = payload.get("task")
    memo = payload.get("memo")

    # 任务事件
    if event == "task.created":
        print(f"新任务: {task['title']}")
    elif event == "task.completed":
        print(f"任务完成: {task['title']} at {task['completedAt']}")
    elif event == "task.reopened":
        print(f"任务重开: {task['title']}")
    elif event == "task.deleted":
        print(f"任务删除: {task['title']}")

    # 备忘录事件
    elif event == "memo.created":
        print(f"新备忘录: {memo['id']} in {memo['projectId']}")
    elif event == "memo.updated":
        print(f"备忘录更新: {memo['id']}")
    elif event == "memo.deleted":
        print(f"备忘录删除: {memo['id']}")

    return "", 200
```

### Node.js (Express)

```javascript
app.post("/velo-webhook", (req, res) => {
  const { event, task, memo } = req.body;

  switch (event) {
    case "task.created":
      console.log(`新任务: ${task.title}`);
      break;
    case "task.completed":
      console.log(`任务完成: ${task.title} at ${task.completedAt}`);
      break;
    case "task.reopened":
      console.log(`任务重开: ${task.title}`);
      break;
    case "task.deleted":
      console.log(`任务删除: ${task.title}`);
      break;
    case "memo.created":
      console.log(`新备忘录: ${memo.id}`);
      break;
    case "memo.updated":
      console.log(`备忘录更新: ${memo.id}`);
      break;
    case "memo.deleted":
      console.log(`备忘录删除: ${memo.id}`);
      break;
  }

  res.sendStatus(200);
});
```

### Go (net/http)

```go
func veloWebhook(w http.ResponseWriter, r *http.Request) {
    var payload struct {
        Event string          `json:"event"`
        Task  *TaskData       `json:"task"`
        Memo  *MemoData       `json:"memo"`
    }
    json.NewDecoder(r.Body).Decode(&payload)

    switch payload.Event {
    case "task.created":
        log.Printf("新任务: %s", payload.Task.Title)
    case "task.completed":
        log.Printf("任务完成: %s at %s", payload.Task.Title, payload.Task.CompletedAt)
    case "task.reopened":
        log.Printf("任务重开: %s", payload.Task.Title)
    case "task.deleted":
        log.Printf("任务删除: %s", payload.Task.Title)
    case "memo.created":
        log.Printf("新备忘录: %s", payload.Memo.ID)
    case "memo.updated":
        log.Printf("备忘录更新: %s", payload.Memo.ID)
    case "memo.deleted":
        log.Printf("备忘录删除: %s", payload.Memo.ID)
    }

    w.WriteHeader(http.StatusOK)
}
```

## 配置 Hook

在 `{vault}/hooks.json` 中配置 hook 规则。文件不存在时自动创建空配置。

```json
{
  "schemaVersion": 1,
  "hooks": [
    {
      "id": "hook_20260803T120000_a1b2c3",
      "name": "我的自动化服务",
      "url": "https://my-service.example.com/velo-webhook",
      "enabled": true,
      "events": [
        "task.created",
        "task.completed",
        "task.reopened",
        "task.deleted",
        "memo.created",
        "memo.updated",
        "memo.deleted"
      ]
    }
  ]
}
```

每个字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 唯一 ID，创建时自动生成 |
| `name` | string | 显示名称 |
| `url` | string | 接收 webhook 的 HTTP(S) URL |
| `enabled` | bool | 是否启用 |
| `events` | string[] | 要监听的事件列表，可用事件见上方[事件类型](#事件类型) |

> **注意**：Velo 目前仅提供文件配置方式，后续会加入 UI 管理界面。

## 常见集成场景

### 任务自动化

| 场景 | 处理逻辑 |
|------|---------|
| **同步到 Notion** | 收到 `task.created` → 调用 Notion API 创建 page |
| **同步到飞书多维表格** | 收到 `task.created` → 调用飞书 API 新增记录 |
| **完成任务通知** | 收到 `task.completed` → 推送到 Slack/钉钉/飞书群 |
| **GitHub Issue** | 收到 `task.created` → 创建 GitHub Issue；收到 `task.completed` → 关闭 Issue |
| **数据备份** | 收到任意 task 事件 → 写入数据库/日志 |
| **任务删除清理** | 收到 `task.deleted` → 同步删除外部系统中的关联数据 |

### 备忘录自动化

| 场景 | 处理逻辑 |
|------|---------|
| **自动索引** | 收到 `memo.created` / `memo.updated` → 提取关键词更新搜索索引 |
| **变更通知** | 收到 `memo.updated` → 推送变更摘要到团队频道 |
| **备份同步** | 收到 `memo.updated` → 同步到 Git 仓库或云存储 |
| **清理关联** | 收到 `memo.deleted` → 清理外部系统中的引用和缓存 |
