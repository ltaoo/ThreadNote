package desktopapp

import (
	"fmt"
	"strings"
)

// edit represents a single edit operation in the diff.
type diffEdit struct {
	typ     int // 0 = equal, 1 = delete, 2 = insert
	oldLine int
	newLine int
}

const (
	diffEqual  = 0
	diffDelete = 1
	diffInsert = 2
)

// computeUnifiedDiff generates a line-based unified diff between old and new text.
func computeUnifiedDiff(old, new string) string {
	oldLines := splitLines(old)
	newLines := splitLines(new)
	edits := myersDiff(oldLines, newLines)
	if len(edits) == 0 {
		return ""
	}
	// Check if there are any actual changes
	hasChanges := false
	for _, e := range edits {
		if e.typ != diffEqual {
			hasChanges = true
			break
		}
	}
	if !hasChanges {
		return ""
	}
	return formatUnifiedDiff(edits, oldLines, newLines)
}

// applyUnifiedDiff applies a sequence of unified diff patches to base text.
func applyUnifiedDiff(base string, patches []string) string {
	result := base
	for _, patch := range patches {
		result = applySinglePatch(result, patch)
	}
	return result
}

// applySinglePatch applies a single unified diff patch to text.
func applySinglePatch(text string, patch string) string {
	oldLines := splitLines(text)
	patchLines := splitLines(patch)

	// Find the first hunk header
	startIdx := 0
	for startIdx < len(patchLines) {
		if strings.HasPrefix(patchLines[startIdx], "@@") {
			break
		}
		startIdx++
	}
	if startIdx >= len(patchLines) {
		return text
	}

	var result []string
	oldIdx := 0

	i := startIdx
	for i < len(patchLines) {
		line := patchLines[i]
		if !strings.HasPrefix(line, "@@") {
			i++
			continue
		}

		// Parse "@@ -oldStart[,oldCount] +newStart[,newCount] @@"
		oldStart, oldCount := parseHunkHeader(line)
		oldStart-- // Convert to 0-based
		if oldStart < 0 {
			oldStart = 0
		}
		// If oldCount is 0 (insert-only hunk), adjust
		if oldCount == 0 {
			oldCount = 0
		}

		// Copy unchanged lines before this hunk
		for oldIdx < oldStart && oldIdx < len(oldLines) {
			result = append(result, oldLines[oldIdx])
			oldIdx++
		}

		i++ // Skip the hunk header

		// Apply the hunk
		for i < len(patchLines) && !strings.HasPrefix(patchLines[i], "@@") {
			patchLine := patchLines[i]
			if len(patchLine) == 0 {
				result = append(result, "")
				oldIdx++
				i++
				continue
			}
			switch patchLine[0] {
			case '-':
				oldIdx++
			case '+':
				result = append(result, patchLine[1:])
			default:
				// Context line (starts with space) or no prefix
				content := patchLine
				if patchLine[0] == ' ' {
					content = patchLine[1:]
				}
				result = append(result, content)
				oldIdx++
			}
			i++
		}
	}

	// Copy remaining lines
	for oldIdx < len(oldLines) {
		result = append(result, oldLines[oldIdx])
		oldIdx++
	}

	return strings.Join(result, "\n")
}

func parseHunkHeader(line string) (oldStart, oldCount int) {
	rest := strings.TrimPrefix(line, "@@")
	rest = strings.TrimSuffix(rest, "@@")
	parts := strings.Fields(rest)
	if len(parts) >= 1 {
		oldPart := strings.TrimPrefix(parts[0], "-")
		if commaIdx := strings.IndexByte(oldPart, ','); commaIdx >= 0 {
			fmt.Sscanf(oldPart, "%d,%d", &oldStart, &oldCount)
		} else {
			fmt.Sscanf(oldPart, "%d", &oldStart)
			oldCount = 1
		}
	}
	return
}

// splitLines splits text into lines, preserving the trailing empty line
// that strings.Split creates when text ends with \n.
// This ensures consistent diff behavior regardless of trailing newline.
func splitLines(text string) []string {
	if text == "" {
		return []string{}
	}
	lines := strings.Split(text, "\n")
	// Remove the trailing empty element if text ended with \n,
	// since we handle line endings consistently
	return lines
}

// myersDiff implements the Myers O(ND) diff algorithm.
func myersDiff(a, b []string) []diffEdit {
	n := len(a)
	m := len(b)
	max := n + m
	if max == 0 {
		return nil
	}

	offset := max // For negative k indices
	vSize := 2*max + 1
	v := make([]int, vSize)

	// Store V snapshots for backtracking
	vs := make([][]int, 0)

	v[offset+1] = 0 // k=1, x=0

	for d := 0; d <= max; d++ {
		vCopy := make([]int, vSize)
		copy(vCopy, v)
		vs = append(vs, vCopy)

		for k := -d; k <= d; k += 2 {
			var x int
			idx := offset + k

			if k == -d || (k != d && v[offset+k-1] < v[offset+k+1]) {
				x = v[offset+k+1] // Move down (insert from b)
			} else {
				x = v[offset+k-1] + 1 // Move right (delete from a)
			}
			y := x - k

			// Follow the diagonal (matching lines)
			for x < n && y < m && a[x] == b[y] {
				x++
				y++
			}

			v[idx] = x

			if x >= n && y >= m {
				return backtrackMyers(vs, a, b, d, k, offset)
			}
		}
	}

	return nil
}

func backtrackMyers(vs [][]int, a, b []string, d, k, offset int) []diffEdit {
	edits := make([]diffEdit, 0)
	x := len(a)
	y := len(b)

	for p := d; p >= 0; p-- {
		v := vs[p]

		var prevK int
		if k == -p || (k != p && v[offset+k-1] < v[offset+k+1]) {
			prevK = k + 1
		} else {
			prevK = k - 1
		}

		prevX := v[offset+prevK]
		prevY := prevX - prevK

		// Walk the diagonal backwards
		for x > prevX && y > prevY {
			x--
			y--
			edits = append(edits, diffEdit{diffEqual, x, y})
		}

		if p > 0 {
			if x > prevX {
				x--
				edits = append(edits, diffEdit{diffDelete, x, y})
			} else if y > prevY {
				y--
				edits = append(edits, diffEdit{diffInsert, x, y})
			}
		}

		x = prevX
		y = prevY
		k = prevK
	}

	// Reverse to get forward order
	for i, j := 0, len(edits)-1; i < j; i, j = i+1, j-1 {
		edits[i], edits[j] = edits[j], edits[i]
	}

	return edits
}

type diffHunk struct {
	oldStart, oldCount int
	newStart, newCount int
	lines              []string
}

// formatUnifiedDiff converts edits into unified diff format.
func formatUnifiedDiff(edits []diffEdit, oldLines, newLines []string) string {
	const context = 3

	hunks := []diffHunk{}

	// Compute change ranges
	editLen := len(edits)
	for i := 0; i < editLen; {
		e := edits[i]
		if e.typ == diffEqual {
			i++
			continue
		}

		// Start a new change group
		changeStart := i
		oldStart := e.oldLine
		newStart := e.newLine
		oldEnd := e.oldLine
		newEnd := e.newLine

		for i < editLen && edits[i].typ != diffEqual {
			ce := edits[i]
			if ce.typ == diffDelete {
				if ce.oldLine > oldEnd {
					oldEnd = ce.oldLine
				}
			}
			if ce.typ == diffInsert {
				if ce.newLine > newEnd {
					newEnd = ce.newLine
				}
			}
			i++
		}
		// After the last change, i points to an equal or end
		_ = changeStart

		// Compute context boundaries
		ctxStart := oldStart - context
		if ctxStart < 0 {
			ctxStart = 0
		}
		ctxEnd := oldEnd + context
		if ctxEnd >= len(oldLines) {
			ctxEnd = len(oldLines) - 1
		}

		// Build hunk lines
		hunkLines := []string{}
		newLineNum := newStart - (oldStart - ctxStart)
		if newLineNum < 0 {
			newLineNum = 0
		}

		// Walk through edits within the context window
		for idx := 0; idx < editLen; idx++ {
			ce := edits[idx]
			if ce.typ == diffEqual {
				if ce.oldLine >= ctxStart && ce.oldLine <= ctxEnd {
					hunkLines = append(hunkLines, " "+oldLines[ce.oldLine])
				}
			} else if ce.typ == diffDelete {
				if ce.oldLine >= ctxStart && ce.oldLine <= ctxEnd {
					hunkLines = append(hunkLines, "-"+oldLines[ce.oldLine])
				}
			} else if ce.typ == diffInsert {
				if ce.oldLine >= ctxStart && ce.oldLine <= ctxEnd+1 {
					hunkLines = append(hunkLines, "+"+newLines[ce.newLine])
				}
			}
		}

		oldHunkStart := ctxStart
		oldHunkCount := ctxEnd - ctxStart + 1
		// Count actual new lines in this hunk
		newHunkCount := 0
		for _, hl := range hunkLines {
			if hl[0] != '-' {
				newHunkCount++
			}
		}

		hunks = append(hunks, diffHunk{
			oldStart: oldHunkStart,
			oldCount: oldHunkCount,
			newStart: newLineNum,
			newCount: newHunkCount,
			lines:    hunkLines,
		})
	}

	if len(hunks) == 0 {
		return ""
	}

	// Merge adjacent or overlapping hunks
	hunks = mergeHunks(hunks)

	var buf strings.Builder
	buf.WriteString("--- a\n+++ b\n")
	for _, h := range hunks {
		buf.WriteString(fmt.Sprintf("@@ -%d,%d +%d,%d @@\n", h.oldStart+1, h.oldCount, h.newStart+1, h.newCount))
		for _, line := range h.lines {
			buf.WriteString(line)
			buf.WriteByte('\n')
		}
	}

	return buf.String()
}

// ContentOp is a single compact edit operation for CRDT-style history recording.
// Instead of storing full snapshots or unified diffs, each version records the
// minimal set of operations needed to transform the previous content.
type ContentOp struct {
	Type  string `json:"type"`            // "retain", "insert", "delete"
	From  int    `json:"from,omitempty"`  // rune position in base content where this op applies
	Count int    `json:"count,omitempty"` // character count for retain / delete
	Text  string `json:"text,omitempty"`  // inserted text for insert
}

type runeEdit struct {
	typ    int  // diffEqual, diffDelete, diffInsert
	oldPos int
	newPos int
	char   rune
}

// computeContentOps computes CRDT-style minimal operations between old and new
// plain-text content. It uses a character-level Myers diff and compacts adjacent
// same-type edits into the fewest possible operations.
func computeContentOps(oldContent, newContent string) []ContentOp {
	oldRunes := []rune(oldContent)
	newRunes := []rune(newContent)
	edits := myersRuneDiff(oldRunes, newRunes)
	return compactRuneEdits(edits)
}

// computePositionalOps is like computeContentOps but annotates each delete/insert
// with its absolute rune position (From) in the old content. Retain operations
// are omitted since the cursor position is implied by the From fields.
// A delete+insert pair at the same position (a replacement) shares the same From.
func computePositionalOps(oldContent, newContent string) []ContentOp {
	seqOps := computeContentOps(oldContent, newContent)
	var result []ContentOp
	pos := 0
	lastDeleteFrom := -1
	for _, op := range seqOps {
		switch op.Type {
		case "retain":
			pos += op.Count
			lastDeleteFrom = -1 // intervening retain breaks the delete-insert pair
		case "delete":
			lastDeleteFrom = pos
			result = append(result, ContentOp{Type: "delete", From: pos, Count: op.Count})
			pos += op.Count
		case "insert":
			from := pos
			if lastDeleteFrom >= 0 {
				from = lastDeleteFrom
				lastDeleteFrom = -1 // consumed
			}
			result = append(result, ContentOp{Type: "insert", From: from, Text: op.Text})
		}
	}
	return result
}

// applyPositionalOps applies position-based ContentOps to base content.
// Each op carries an absolute From position in the original base.
// Ops are applied in order of From; for same-From, delete before insert.
func applyPositionalOps(baseContent string, ops []ContentOp) string {
	if len(ops) == 0 {
		return baseContent
	}
	seqOps := positionalToSequential(ops, len([]rune(baseContent)))
	return string(applySingleOps([]rune(baseContent), seqOps))
}

// positionalToSequential converts position-based ops back to sequential form.
func positionalToSequential(ops []ContentOp, baseLen int) []ContentOp {
	if len(ops) == 0 {
		return nil
	}
	var seq []ContentOp
	pos := 0
	for _, op := range ops {
		if op.From > pos {
			seq = append(seq, ContentOp{Type: "retain", Count: op.From - pos})
			pos = op.From
		} else if op.From < pos {
			// Overlapping positions: this insert follows a prior delete at same position.
			// Do not re-emit retain; the cursor is already at the right place.
		}
		switch op.Type {
		case "delete":
			seq = append(seq, ContentOp{Type: "delete", Count: op.Count})
			pos += op.Count
		case "insert":
			seq = append(seq, ContentOp{Type: "insert", Text: op.Text})
		}
	}
	if pos < baseLen {
		seq = append(seq, ContentOp{Type: "retain", Count: baseLen - pos})
	}
	return seq
}

// invertPositionalOps produces the inverse sequential ops that, when applied
// to the new content, recover the original base content. The base is needed to
// recover the text that was deleted.
func invertPositionalOps(baseContent string, ops []ContentOp) []ContentOp {
	baseRunes := []rune(baseContent)
	seqOps := positionalToSequential(ops, len(baseRunes))

	var inverted []ContentOp
	pos := 0
	for _, op := range seqOps {
		switch op.Type {
		case "retain":
			inverted = append(inverted, ContentOp{Type: "retain", Count: op.Count})
			pos += op.Count
		case "delete":
			// Inverse: insert the deleted text back
			text := string(baseRunes[pos : pos+op.Count])
			inverted = append(inverted, ContentOp{Type: "insert", Text: text})
			pos += op.Count
		case "insert":
			// Inverse: delete the inserted text
			inverted = append(inverted, ContentOp{Type: "delete", Count: len([]rune(op.Text))})
		}
	}
	return inverted
}

// applyContentOps replays a sequence of operation lists on base content and
// returns the fully reconstructed content.
func applyContentOps(baseContent string, opsList [][]ContentOp) string {
	runes := []rune(baseContent)
	for _, ops := range opsList {
		if len(ops) == 0 {
			continue
		}
		runes = applySingleOps(runes, ops)
	}
	return string(runes)
}

// applySingleOps applies one set of ContentOps to a rune slice.
func applySingleOps(runes []rune, ops []ContentOp) []rune {
	var result []rune
	pos := 0
	for _, op := range ops {
		switch op.Type {
		case "retain":
			if pos+op.Count > len(runes) {
				op.Count = len(runes) - pos
			}
			if op.Count > 0 {
				result = append(result, runes[pos:pos+op.Count]...)
				pos += op.Count
			}
		case "insert":
			result = append(result, []rune(op.Text)...)
		case "delete":
			pos += op.Count
			if pos > len(runes) {
				pos = len(runes)
			}
		}
	}
	// Append any remaining runes
	if pos < len(runes) {
		result = append(result, runes[pos:]...)
	}
	return result
}

// myersRuneDiff computes the shortest edit script between two rune slices
// using the Myers O(ND) algorithm.
func myersRuneDiff(a, b []rune) []runeEdit {
	n := len(a)
	m := len(b)
	max := n + m
	if max == 0 {
		return nil
	}

	offset := max
	vSize := 2*max + 1
	v := make([]int, vSize)
	vs := make([][]int, 0)

	v[offset+1] = 0

	for d := 0; d <= max; d++ {
		vCopy := make([]int, vSize)
		copy(vCopy, v)
		vs = append(vs, vCopy)

		for k := -d; k <= d; k += 2 {
			var x int
			idx := offset + k

			if k == -d || (k != d && v[offset+k-1] < v[offset+k+1]) {
				x = v[offset+k+1]
			} else {
				x = v[offset+k-1] + 1
			}
			y := x - k

			for x < n && y < m && a[x] == b[y] {
				x++
				y++
			}

			v[idx] = x

			if x >= n && y >= m {
				return backtrackRuneDiff(vs, a, b, d, k, offset)
			}
		}
	}

	return nil
}

func backtrackRuneDiff(vs [][]int, a, b []rune, d, k, offset int) []runeEdit {
	edits := make([]runeEdit, 0)
	x := len(a)
	y := len(b)

	for p := d; p >= 0; p-- {
		v := vs[p]

		var prevK int
		if k == -p || (k != p && v[offset+k-1] < v[offset+k+1]) {
			prevK = k + 1
		} else {
			prevK = k - 1
		}

		prevX := v[offset+prevK]
		prevY := prevX - prevK

		for x > prevX && y > prevY {
			x--
			y--
			edits = append(edits, runeEdit{diffEqual, x, y, a[x]})
		}

		if p > 0 {
			if x > prevX {
				x--
				edits = append(edits, runeEdit{diffDelete, x, y, a[x]})
			} else if y > prevY {
				y--
				edits = append(edits, runeEdit{diffInsert, x, y, b[y]})
			}
		}

		x = prevX
		y = prevY
		k = prevK
	}

	for i, j := 0, len(edits)-1; i < j; i, j = i+1, j-1 {
		edits[i], edits[j] = edits[j], edits[i]
	}

	return edits
}

// compactRuneEdits merges adjacent same-type edits into ContentOp records.
func compactRuneEdits(edits []runeEdit) []ContentOp {
	if len(edits) == 0 {
		return nil
	}

	ops := make([]ContentOp, 0)
	i := 0
	for i < len(edits) {
		e := edits[i]
		switch e.typ {
		case diffEqual:
			count := 0
			for i < len(edits) && edits[i].typ == diffEqual {
				count++
				i++
			}
			ops = append(ops, ContentOp{Type: "retain", Count: count})
		case diffInsert:
			var buf strings.Builder
			for i < len(edits) && edits[i].typ == diffInsert {
				buf.WriteRune(edits[i].char)
				i++
			}
			ops = append(ops, ContentOp{Type: "insert", Text: buf.String()})
		case diffDelete:
			count := 0
			for i < len(edits) && edits[i].typ == diffDelete {
				count++
				i++
			}
			ops = append(ops, ContentOp{Type: "delete", Count: count})
		}
	}

	return ops
}

func mergeHunks(hunks []diffHunk) []diffHunk {
	if len(hunks) <= 1 {
		return hunks
	}
	merged := []diffHunk{hunks[0]}
	for i := 1; i < len(hunks); i++ {
		prev := &merged[len(merged)-1]
		curr := hunks[i]
		prevEnd := prev.oldStart + prev.oldCount
		if curr.oldStart <= prevEnd+3 {
			prev.oldCount = curr.oldStart + curr.oldCount - prev.oldStart
			prev.newCount += curr.newCount
			prev.lines = append(prev.lines, curr.lines...)
		} else {
			merged = append(merged, curr)
		}
	}
	return merged
}
