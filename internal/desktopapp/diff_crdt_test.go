package desktopapp

import (
	"strconv"
	"strings"
	"testing"
)

func replayOps(base string, ops []ContentOp) string {
	return applyContentOps(base, [][]ContentOp{ops})
}

func opsString(ops []ContentOp) string {
	parts := make([]string, 0, len(ops))
	for _, op := range ops {
		switch op.Type {
		case "retain":
			s := "R" + strconv.Itoa(op.Count)
			if op.From != 0 {
				s += "@" + strconv.Itoa(op.From)
			}
			parts = append(parts, s)
		case "insert":
			s := "I" + op.Text
			if op.From != 0 {
				s = strconv.Itoa(op.From) + ":" + s
			}
			parts = append(parts, s)
		case "delete":
			s := "D" + strconv.Itoa(op.Count)
			if op.From != 0 {
				s = strconv.Itoa(op.From) + ":" + s
			}
			parts = append(parts, s)
		}
	}
	return strings.Join(parts, " ")
}

// ==================== computeMinimalContentOps tests ====================

func TestMinimalContentOps_RoundTrip(t *testing.T) {
	tests := []struct {
		name    string
		oldText string
		newText string
	}{
		{"both empty", "", ""},
		{"old empty", "", "hello"},
		{"new empty", "hello", ""},
		{"no changes", "hello world", "hello world"},

		// insert
		{"insert beginning", "hello world", "Xhello world"},
		{"insert end", "hello world", "hello world!"},
		{"insert middle", "hello world", "hello X world"},
		{"insert Chinese", "你好世界", "你好，世界"},

		// delete
		{"delete beginning", "Xhello world", "hello world"},
		{"delete end", "hello world!", "hello world"},
		{"delete middle", "hello X world", "hello world"},

		// replace
		{"replace word", "hello world", "hello there"},
		{"replace Chinese", "hello 世界", "hello 中国"},

		// multi-line
		{"insert line", "line one\nline two", "line one\nline 1.5\nline two"},
		{"delete line", "line one\nline 1.5\nline two", "line one\nline two"},
		{"replace line", "line one\nold line\nline two", "line one\nnew line\nline two"},

		// scattered changes
		{"scattered", "AB old CD old EF", "AB new CD new EF"},

		// real-world scenario
		{"scenario insert", "hello world", "hello world, how are you"},
		{"scenario delete", "hello world, how are you", "hello world are you"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ops := computeMinimalContentOps(tt.oldText, tt.newText)
			got := replayOps(tt.oldText, ops)
			if got != tt.newText {
				t.Errorf("round-trip failed.\n  ops:  %s\n  old:  %q\n  want: %q\n  got:  %q",
					opsString(ops), tt.oldText, tt.newText, got)
			}
		})
	}
}

func TestMinimalContentOps_ExactOps(t *testing.T) {
	tests := []struct {
		name    string
		oldText string
		newText string
		want    string // expected ops string
	}{
		// Simple cases where token alignment is unambiguous
		{"insert at beginning", "hello world", "Xhello world", "IX R11"},
		{"insert at end", "hello world", "hello world!", "R11 I!"},
		{"insert Chinese", "你好世界", "你好，世界", "R2 I， R2"},
		{"delete at beginning", "Xhello world", "hello world", "D1 R11"},
		{"delete at end", "hello world!", "hello world", "R11 D1"},
		{"replace word", "hello world", "hello there", "R6 D5 Ithere"},

		// Multi-line: these should have line-aware alignment
		{"insert line", "line one\nline two", "line one\nline 1.5\nline two", "R14 I1.5\nline  R3"},
		{"delete line", "line one\nline 1.5\nline two", "line one\nline two", "R14 D9 R3"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ops := computeMinimalContentOps(tt.oldText, tt.newText)
			got := opsString(ops)

			// Verify round-trip
			if r := replayOps(tt.oldText, ops); r != tt.newText {
				t.Errorf("round-trip failed. got: %q", r)
			}

			if got != tt.want {
				t.Errorf("ops mismatch.\n  want: %s\n  got:  %s", tt.want, got)
			}
		})
	}
}

func TestMinimalContentOps_Minimality(t *testing.T) {
	// A long common prefix + suffix — ops should be dominated by retains
	oldText := strings.Repeat("the quick brown fox jumps over the lazy dog\n", 50)
	newText := strings.Repeat("the quick brown fox jumps over the lazy dog\n", 50)
	lines := strings.Split(newText, "\n")
	lines[25] = "!!! CHANGED LINE !!!"
	newText = strings.Join(lines, "\n")

	ops := computeMinimalContentOps(oldText, newText)

	if r := replayOps(oldText, ops); r != newText {
		t.Fatalf("round-trip failed")
	}

	t.Logf("ops count: %d for %d-char doc with 1 line changed", len(ops), len([]rune(oldText)))

	if len(ops) > 10 {
		t.Errorf("too many ops (%d) for single-line change — expected <= 10", len(ops))
	}
}

func TestMinimalContentOps_vs_Current(t *testing.T) {
	cases := []struct{ old, new string }{
		{"hello", "hello world"},
		{"你好世界", "你好新世界"},
		{"line1\nline2\nline3", "line1\nline2-changed\nline3"},
		{"", "new content"},
		{"remove me", ""},
	}

	for _, c := range cases {
		currentOps := computeContentOps(c.old, c.new)
		minimalOps := computeMinimalContentOps(c.old, c.new)

		if r := replayOps(c.old, currentOps); r != c.new {
			t.Errorf("computeContentOps round-trip failed for %q -> %q: got %q", c.old, c.new, r)
		}
		if r := replayOps(c.old, minimalOps); r != c.new {
			t.Errorf("computeMinimalContentOps round-trip failed for %q -> %q: got %q", c.old, c.new, r)
		}

		t.Logf("%q -> %q: current=%d ops, minimal=%d ops",
			c.old, c.new, len(currentOps), len(minimalOps))
	}
}

// TestMinimalContentOps_RealData tests with the actual history.json data.
func TestMinimalContentOps_RealData(t *testing.T) {
	base := "最上面增加一行\n\n增加记录功能，测试下能不能恢复历史\n\n编辑内容，修改行内容，insert删除非常多内容\n\n\n"
	// v1 after ops applied
	v1Ops := []ContentOp{
		{Type: "delete", Count: 3},
		{Type: "retain", Count: 2},
		{Type: "delete", Count: 6},
		{Type: "retain", Count: 7},
		{Type: "delete", Count: 1},
		{Type: "retain", Count: 8},
		{Type: "insert", Text: "增加行"},
		{Type: "retain", Count: 5},
		{Type: "insert", Text: "inert conetnet"},
		{Type: "retain", Count: 21},
		{Type: "delete", Count: 2},
	}
	v1Content := replayOps(base, v1Ops)

	// Compute ops from base to v1 using both methods
	currentOps := computeContentOps(base, v1Content)
	minimalOps := computeMinimalContentOps(base, v1Content)

	// Both must round-trip
	if r := replayOps(base, currentOps); r != v1Content {
		t.Errorf("computeContentOps round-trip failed. got: %q", r)
	}
	if r := replayOps(base, minimalOps); r != v1Content {
		t.Errorf("computeMinimalContentOps round-trip failed. got: %q", r)
	}

	t.Logf("real data: base=%d chars, v1=%d chars", len([]rune(base)), len([]rune(v1Content)))
	t.Logf("current ops (%d): %s", len(currentOps), opsString(currentOps))
	t.Logf("minimal ops (%d): %s", len(minimalOps), opsString(minimalOps))
}

func TestContentManually_RealData(t *testing.T) {
	base := "把自动化工具做成可视化工具\n\n- starlink前端发布\n- feishu文档创建\n\n\n就是一个个人工作台，不需要来回切换软件，只在一个窗口完成所有工作"
	v1tt := "把自动化工具做成可视化版本，比如这些功能\n- starlink前端发布\n- feishu文档创建\n- gitlab代码查找\n\n就是一个个人工作台，不需要来回切换软件，只在一个窗口完成所有工作"

	ops := computePositionalOps(base, v1tt)

	expectedOps := []ContentOp{
		{Type: "delete", From: 11, Count: 2},
		{Type: "insert", From: 11, Text: "版本，比如这些功能"},
		{Type: "delete", From: 14, Count: 1},
		{Type: "insert", From: 43, Text: "- gitlab代码查找"},
	}

	// Verify round-trip for actual ops
	got := applyPositionalOps(base, ops)
	if got != v1tt {
		t.Errorf("actual ops round-trip failed.\n  want: %q\n  got:  %q", v1tt, got)
	}

	// Verify round-trip for expected ops
	got2 := applyPositionalOps(base, expectedOps)
	if got2 != v1tt {
		t.Errorf("expected ops round-trip failed.\n  want: %q\n  got:  %q", v1tt, got2)
	}

	t.Logf("actual ops   (%d): %s", len(ops), opsString(ops))
	t.Logf("expected ops (%d): %s", len(expectedOps), opsString(expectedOps))

	if len(ops) != len(expectedOps) {
		t.Errorf("ops count mismatch: want %d, got %d", len(expectedOps), len(ops))
	}

	for i := range ops {
		if i >= len(expectedOps) {
			break
		}
		if ops[i].Type != expectedOps[i].Type {
			t.Errorf("ops[%d].Type mismatch: want %q, got %q", i, expectedOps[i].Type, ops[i].Type)
		}
		if ops[i].From != expectedOps[i].From {
			t.Errorf("ops[%d].From mismatch: want %d, got %d", i, expectedOps[i].From, ops[i].From)
		}
		if ops[i].Count != expectedOps[i].Count {
			t.Errorf("ops[%d].Count mismatch: want %d, got %d", i, expectedOps[i].Count, ops[i].Count)
		}
		if ops[i].Text != expectedOps[i].Text {
			t.Errorf("ops[%d].Text mismatch: want %q, got %q", i, expectedOps[i].Text, ops[i].Text)
		}
	}

	// Verify reverse: apply inverted ops to v1tt recovers base
	inverted := invertPositionalOps(base, ops)
	recovered := string(applySingleOps([]rune(v1tt), inverted))
	if recovered != base {
		t.Errorf("reverse round-trip failed.\n  base:  %q\n  recovered: %q\n  inverted ops: %s",
			base, recovered, opsString(inverted))
	}
	t.Logf("inverted ops: %s", opsString(inverted))
}

func TestPositionalOps_Invert(t *testing.T) {
	cases := []struct {
		name string
		base string
		new  string
	}{
		{"insert end", "hello", "hello world"},
		{"delete end", "hello world", "hello"},
		{"replace middle", "hello world", "hello there"},
		{"insert Chinese", "你好世界", "你好，世界"},
		{"multi-line", "line one\nline two", "line one\nline 1.5\nline two"},
		{"complex real data",
			"把自动化工具做成可视化工具\n\n- starlink前端发布\n- feishu文档创建\n\n\n就是一个个人工作台，不需要来回切换软件，只在一个窗口完成所有工作",
			"把自动化工具做成可视化版本，比如这些功能\n- starlink前端发布\n- feishu文档创建\n- gitlab代码查找\n\n就是一个个人工作台，不需要来回切换软件，只在一个窗口完成所有工作",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ops := computePositionalOps(c.base, c.new)

			// Forward: base + ops → new
			got := applyPositionalOps(c.base, ops)
			if got != c.new {
				t.Fatalf("forward round-trip failed.\n  want: %q\n  got:  %q", c.new, got)
			}

			// Reverse: new + inverted ops → base
			inverted := invertPositionalOps(c.base, ops)
			recovered := string(applySingleOps([]rune(c.new), inverted))
			if recovered != c.base {
				t.Errorf("reverse round-trip failed.\n  base:      %q\n  recovered: %q\n  inverted:  %s",
					c.base, recovered, opsString(inverted))
			}
		})
	}
}


