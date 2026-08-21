package service

import (
	"strings"
	"unicode"
)

// tokenWithPos holds a token and its byte-offset tracking info for converting
// token-level diff results back to character-level ContentOps.
type tokenWithPos struct {
	text   string
	length int // rune count of this token
}

// tokenize splits text into tokens matching the frontend's tokenizeForDiff:
//
//	Chinese characters individually
//	ASCII word runs as groups
//	Punctuation individually
//	Whitespace individually (including newlines)
//
// Returns tokens with their rune lengths.
func tokenize(text string) []tokenWithPos {
	if text == "" {
		return nil
	}
	runes := []rune(text)
	tokens := make([]tokenWithPos, 0)
	i := 0
	for i < len(runes) {
		r := runes[i]
		switch {
		case isCJK(r):
			tokens = append(tokens, tokenWithPos{text: string(r), length: 1})
			i++
		case unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_':
			// Group consecutive ASCII word characters
			start := i
			for i < len(runes) && (unicode.IsLetter(runes[i]) || unicode.IsDigit(runes[i]) || runes[i] == '_') {
				i++
			}
			tokens = append(tokens, tokenWithPos{text: string(runes[start:i]), length: i - start})
		case unicode.IsSpace(r):
			// Group consecutive whitespace
			start := i
			for i < len(runes) && unicode.IsSpace(runes[i]) {
				i++
			}
			tokens = append(tokens, tokenWithPos{text: string(runes[start:i]), length: i - start})
		default:
			// Punctuation / symbols — individual
			tokens = append(tokens, tokenWithPos{text: string(r), length: 1})
			i++
		}
	}
	return tokens
}

func isCJK(r rune) bool {
	return (r >= 0x4E00 && r <= 0x9FFF) ||
		(r >= 0x3400 && r <= 0x4DBF) ||
		(r >= 0xF900 && r <= 0xFAFF) ||
		(r >= 0x20000 && r <= 0x2A6DF) ||
		(r >= 0x2F800 && r <= 0x2FA1F)
}

// computeMinimalContentOps computes CRDT operations using token-level diff
// followed by character-level diff within changed token regions. This mirrors
// the frontend's renderInlineDiffHTML two-pass approach:
//
//  1. Tokenize both strings
//  2. Token-level Myers diff → find which tokens changed
//  3. For changed tokens, character-level diff within those spans
//  4. Compact adjacent same-type operations
//
// Compared to pure character-level diff, this produces fewer operations
// because ASCII words and whitespace runs are treated as atomic units.
func computeMinimalContentOps(oldContent, newContent string) []ContentOp {
	if oldContent == newContent {
		if oldContent == "" {
			return nil
		}
		return []ContentOp{{Type: "retain", Count: len([]rune(oldContent))}}
	}
	if oldContent == "" {
		return []ContentOp{{Type: "insert", Text: newContent}}
	}
	if newContent == "" {
		return []ContentOp{{Type: "delete", Count: len([]rune(oldContent))}}
	}

	oldTokens := tokenize(oldContent)
	newTokens := tokenize(newContent)

	// Token-level diff: extract text slices for comparison
	oldTokenTexts := make([]string, len(oldTokens))
	for i, t := range oldTokens {
		oldTokenTexts[i] = t.text
	}
	newTokenTexts := make([]string, len(newTokens))
	for i, t := range newTokens {
		newTokenTexts[i] = t.text
	}

	tokenEdits := myersDiff(oldTokenTexts, newTokenTexts)

	// Build character-level edits from token edits.
	// Adjacent change blocks separated by very small equal tokens (≤3 runes,
	// e.g. a single space) are merged to avoid fragmented operations.
	var charEdits []runeEdit
	oldRunePos := 0
	newRunePos := 0

	for i := 0; i < len(tokenEdits); {
		te := tokenEdits[i]

		if te.typ == diffEqual {
			tok := oldTokens[te.oldLine]
			for k := 0; k < tok.length; k++ {
				charEdits = append(charEdits, runeEdit{
					typ: diffEqual, oldPos: oldRunePos, newPos: newRunePos, char: 0,
				})
				oldRunePos++
				newRunePos++
			}
			i++
		} else {
			// Collect a change block, merging small in-between equal tokens
			var oldBlock, newBlock strings.Builder
			oldBlockStart := oldRunePos
			newBlockStart := newRunePos
			oldBlockLen := 0
			newBlockLen := 0

			for i < len(tokenEdits) && tokenEdits[i].typ != diffEqual {
				te2 := tokenEdits[i]
				if te2.typ == diffDelete {
					tok := oldTokens[te2.oldLine]
					oldBlock.WriteString(tok.text)
					oldBlockLen += tok.length
				} else if te2.typ == diffInsert {
					tok := newTokens[te2.newLine]
					newBlock.WriteString(tok.text)
					newBlockLen += tok.length
				}
				i++
			}

			// Merge subsequent small equal + change patterns
			for i < len(tokenEdits) {
				// Count total length of upcoming equal tokens
				eqLen := 0
				j := i
				for j < len(tokenEdits) && tokenEdits[j].typ == diffEqual {
					tok := oldTokens[tokenEdits[j].oldLine]
					eqLen += tok.length
					j++
				}
				// Only merge if: there are equal tokens, their total is small,
				// and they are followed by more changes
				if eqLen == 0 || eqLen > 3 || j >= len(tokenEdits) || tokenEdits[j].typ == diffEqual {
					break
				}
				// Merge equal tokens into both sides
				for i < len(tokenEdits) && tokenEdits[i].typ == diffEqual {
					tok := oldTokens[tokenEdits[i].oldLine]
					oldBlock.WriteString(tok.text)
					newBlock.WriteString(tok.text)
					oldBlockLen += tok.length
					newBlockLen += tok.length
					i++
				}
				// Merge following change tokens
				for i < len(tokenEdits) && tokenEdits[i].typ != diffEqual {
					te2 := tokenEdits[i]
					if te2.typ == diffDelete {
						tok := oldTokens[te2.oldLine]
						oldBlock.WriteString(tok.text)
						oldBlockLen += tok.length
					} else if te2.typ == diffInsert {
						tok := newTokens[te2.newLine]
						newBlock.WriteString(tok.text)
						newBlockLen += tok.length
					}
					i++
				}
			}

			// Character-level diff within the merged change block.
			blockEdits := myersRuneDiff([]rune(oldBlock.String()), []rune(newBlock.String()))
			compactedBlock := compactRuneEdits(blockEdits)
			if len(compactedBlock) > 2 {
				for k := 0; k < oldBlockLen; k++ {
					charEdits = append(charEdits, runeEdit{
						typ: diffDelete, oldPos: oldBlockStart + k, newPos: newBlockStart,
					})
				}
				newRunes := []rune(newBlock.String())
				for k, r := range newRunes {
					charEdits = append(charEdits, runeEdit{
						typ: diffInsert, oldPos: oldBlockStart, newPos: newBlockStart + k, char: r,
					})
				}
			} else {
				for _, be := range blockEdits {
					be.oldPos += oldBlockStart
					be.newPos += newBlockStart
					charEdits = append(charEdits, be)
				}
			}

			oldRunePos = oldBlockStart + oldBlockLen
			newRunePos = newBlockStart + newBlockLen
		}
	}

	return compactRuneEdits(charEdits)
}
