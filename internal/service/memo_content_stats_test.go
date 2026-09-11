package service

import (
	"strings"
	"testing"
)

func TestAnalyzeMemoContent(t *testing.T) {
	content := "# Title\n" +
		"visit https://example.com docs and [label](https://example.org/page).\n" +
		"![photo](@assets/local/pic.png) and ![raw](https://cdn.example.com/a.jpg).\n" +
		"[报告](local://reports/q3.pdf) plus `skip https://inline.example.com`.\n" +
		"- [ ] first todo\n" +
		"- [x] done todo\n" +
		"```js snippet: helper\n" +
		"const url = \"https://inside-fence.example.com\";\n" +
		"```\n" +
		"plain ``` fenced line\n" +
		"~~~\n" +
		"raw block\n" +
		"~~~\n"

	counts := analyze_memo_content(content)
	if counts.Links != 2 {
		t.Errorf("links = %d, want 2", counts.Links)
	}
	if counts.Images != 2 {
		t.Errorf("images = %d, want 2", counts.Images)
	}
	if counts.Files != 1 {
		t.Errorf("files = %d, want 1", counts.Files)
	}
	if counts.CodeBlocks != 2 {
		t.Errorf("code blocks = %d, want 2", counts.CodeBlocks)
	}
	if counts.CodeSnippets != 1 {
		t.Errorf("code snippets = %d, want 1", counts.CodeSnippets)
	}
	if counts.OpenTodos != 1 || counts.DoneTodos != 1 {
		t.Errorf("todos = %d open / %d done, want 1 / 1", counts.OpenTodos, counts.DoneTodos)
	}
}

func TestAnalyzeMemoContentSnippetsFromPreviousLine(t *testing.T) {
	content := "snippet: util\n```go\nfunc A() {}\n```"
	counts := analyze_memo_content(content)
	if counts.CodeBlocks != 1 || counts.CodeSnippets != 1 {
		t.Errorf("counts = %+v, want 1 block / 1 snippet", counts)
	}
}

func TestMaskMemoInlineCode(t *testing.T) {
	original := "a `code span` b ``x`` c"
	masked := mask_memo_inline_code(original)
	if len(masked) != len(original) {
		t.Fatalf("mask changed length: %q", masked)
	}
	for i := 0; i < len(masked); i++ {
		if masked[i] == '`' {
			t.Fatalf("masked still contains backtick: %q", masked)
		}
	}
	if masked[0] != 'a' || masked[len(masked)-1] != 'c' {
		t.Fatalf("mask altered outside code spans: %q", masked)
	}
}

func TestMaskMemoInlineCodeMultibyte(t *testing.T) {
	original := "中文 `代码 https://a.example.com` 内容 ``x`` 结尾"
	masked := mask_memo_inline_code(original)
	if len(masked) != len(original) {
		t.Fatalf("mask changed byte length: %q", masked)
	}
	for i := 0; i < len(masked); i++ {
		if masked[i] == '`' {
			t.Fatalf("masked still contains backtick: %q", masked)
		}
	}
	if !strings.HasPrefix(masked, "中文") || !strings.Contains(masked, "内容") {
		t.Fatalf("mask altered text outside code spans: %q", masked)
	}
}
