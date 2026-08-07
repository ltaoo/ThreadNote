package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
)

type taskData struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Status      string   `json:"status"`
	Priority    string   `json:"priority"`
	Tags        []string `json:"tags"`
	BoardID     string   `json:"boardId"`
	ProjectID   string   `json:"projectId"`
	ListID      string   `json:"listId"`
	Contexts    []string `json:"contexts"`
	CreatedAt   string   `json:"createdAt"`
	UpdatedAt   string   `json:"updatedAt"`
	DueAt       string   `json:"dueAt"`
	StartAt     string   `json:"startAt"`
	CompletedAt string   `json:"completedAt"`
	CancelledAt string   `json:"cancelledAt"`
	Notes       string   `json:"notes"`
	ParentID    string   `json:"parentId"`
	SubtaskIDs  []string `json:"subtaskIds"`
	Path        string   `json:"path"`
}

type memoData struct {
	ID         string   `json:"id"`
	Content    string   `json:"content"`
	CreatedAt  string   `json:"createdAt"`
	UpdatedAt  string   `json:"updatedAt"`
	Kind       string   `json:"kind"`
	Pinned     bool     `json:"pinned"`
	Archived   bool     `json:"archived"`
	Private    bool     `json:"private"`
	ProjectID  string   `json:"projectId"`
	TaskID     string   `json:"taskId"`
	Tags       []string `json:"tags"`
	References []string `json:"references"`
	Reactions  []string `json:"reactions"`
	Locations  []string `json:"locations"`
	Visibility string   `json:"visibility"`
	Path       string   `json:"path"`
}

type webhookPayload struct {
	Event string     `json:"event"`
	Task  *taskData  `json:"task,omitempty"`
	Memo  *memoData  `json:"memo,omitempty"`
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/api/webhook", veloWebhook)

	fmt.Printf("Webhook receiver listening on :%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func veloWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload webhookPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		log.Printf("[ERROR] 解析请求失败: %v", err)
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	log.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	log.Printf("收到事件: %s", payload.Event)

	switch {
	case payload.Task != nil:
		printTask(payload.Event, payload.Task)
	case payload.Memo != nil:
		printMemo(payload.Event, payload.Memo)
	}

	// 打印完整 JSON（方便调试）
	pretty, err := json.MarshalIndent(payload, "", "  ")
	if err == nil {
		log.Printf("完整 Payload:\n%s", string(pretty))
	}
	log.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

	w.WriteHeader(http.StatusOK)
}

func printTask(event string, t *taskData) {
	switch event {
	case "task.created":
		log.Printf("[任务创建] ID: %s | 标题: %s", t.ID, t.Title)
		log.Printf("  状态: %s | 优先级: %s | 标签: %v", t.Status, t.Priority, t.Tags)
		log.Printf("  项目: %s | 看板: %s | 清单: %s", t.ProjectID, t.BoardID, t.ListID)
		if t.DueAt != "" {
			log.Printf("  截止日期: %s", t.DueAt)
		}
		if t.Notes != "" {
			log.Printf("  备注: %s", t.Notes)
		}
	case "task.completed":
		log.Printf("[任务完成] ID: %s | 标题: %s", t.ID, t.Title)
		log.Printf("  完成时间: %s", t.CompletedAt)
	case "task.reopened":
		log.Printf("[任务重开] ID: %s | 标题: %s", t.ID, t.Title)
	case "task.deleted":
		log.Printf("[任务删除] ID: %s | 标题: %s", t.ID, t.Title)
	}
}

func printMemo(event string, m *memoData) {
	switch event {
	case "memo.created":
		log.Printf("[备忘录创建] ID: %s | 项目: %s", m.ID, m.ProjectID)
		log.Printf("  标签: %v | 可见性: %s", m.Tags, m.Visibility)
		if m.Content != "" {
			preview := m.Content
			if len(preview) > 100 {
				preview = preview[:100] + "..."
			}
			log.Printf("  内容预览: %s", preview)
		}
	case "memo.updated":
		log.Printf("[备忘录更新] ID: %s | 更新时间: %s", m.ID, m.UpdatedAt)
		log.Printf("  标签: %v", m.Tags)
	case "memo.deleted":
		log.Printf("[备忘录删除] ID: %s", m.ID)
	}
}
