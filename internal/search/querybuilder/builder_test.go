package querybuilder

import (
	"testing"
	"time"

	"github.com/blevesearch/bleve/v2/search/query"
)

// --- helpers ---

func buildBoolQ(t *testing.T, s string) *query.BooleanQuery {
	t.Helper()
	q := Build(s)
	bq, ok := q.(*query.BooleanQuery)
	if !ok {
		t.Fatalf("Build(%q): expected *query.BooleanQuery, got %T", s, q)
	}
	return bq
}

func mustClauses(t *testing.T, bq *query.BooleanQuery) []query.Query {
	t.Helper()
	if bq.Must == nil {
		t.Fatalf("BooleanQuery.Must is nil")
	}
	cq, ok := bq.Must.(*query.ConjunctionQuery)
	if !ok {
		t.Fatalf("BooleanQuery.Must: expected *query.ConjunctionQuery, got %T", bq.Must)
	}
	return cq.Conjuncts
}

func mustNotClauses(t *testing.T, bq *query.BooleanQuery) []query.Query {
	t.Helper()
	if bq.MustNot == nil {
		t.Fatalf("BooleanQuery.MustNot is nil")
	}
	dq, ok := bq.MustNot.(*query.DisjunctionQuery)
	if !ok {
		t.Fatalf("BooleanQuery.MustNot: expected *query.DisjunctionQuery, got %T", bq.MustNot)
	}
	return dq.Disjuncts
}

func asDisjunction(t *testing.T, q query.Query) *query.DisjunctionQuery {
	t.Helper()
	dq, ok := q.(*query.DisjunctionQuery)
	if !ok {
		t.Fatalf("expected *query.DisjunctionQuery, got %T", q)
	}
	return dq
}

func asMatch(t *testing.T, q query.Query) *query.MatchQuery {
	t.Helper()
	mq, ok := q.(*query.MatchQuery)
	if !ok {
		t.Fatalf("expected *query.MatchQuery, got %T", q)
	}
	return mq
}

func asTerm(t *testing.T, q query.Query) *query.TermQuery {
	t.Helper()
	tq, ok := q.(*query.TermQuery)
	if !ok {
		t.Fatalf("expected *query.TermQuery, got %T", q)
	}
	return tq
}

func asWildcard(t *testing.T, q query.Query) *query.WildcardQuery {
	t.Helper()
	wq, ok := q.(*query.WildcardQuery)
	if !ok {
		t.Fatalf("expected *query.WildcardQuery, got %T", q)
	}
	return wq
}

func asMatchPhrase(t *testing.T, q query.Query) *query.MatchPhraseQuery {
	t.Helper()
	mpq, ok := q.(*query.MatchPhraseQuery)
	if !ok {
		t.Fatalf("expected *query.MatchPhraseQuery, got %T", q)
	}
	return mpq
}

// freeTextDisjuncts is the number of clauses a plain word fans out to: one per
// DefaultSearch field plus one wildcard per DefaultWildcard field.
const freeTextDisjuncts = 4

// --- Build() tests ---

func Test_build_empty_string(t *testing.T) {
	if _, ok := Build("").(*query.MatchNoneQuery); !ok {
		t.Fatalf("expected *query.MatchNoneQuery, got %T", Build(""))
	}
}

func Test_build_whitespace_only(t *testing.T) {
	if _, ok := Build("   ").(*query.MatchNoneQuery); !ok {
		t.Fatalf("expected *query.MatchNoneQuery, got %T", Build("   "))
	}
}

func Test_build_bare_wildcard_returns_match_all(t *testing.T) {
	for _, input := range []string{"*", "  *  ", "* *"} {
		if _, ok := Build(input).(*query.MatchAllQuery); !ok {
			t.Fatalf("Build(%q): expected *query.MatchAllQuery, got %T", input, Build(input))
		}
	}
}

func Test_build_negated_standalone_wildcard_returns_match_none(t *testing.T) {
	for _, input := range []string{"-*", "golang -*"} {
		if _, ok := Build(input).(*query.MatchNoneQuery); !ok {
			t.Fatalf("Build(%q): expected *query.MatchNoneQuery, got %T", input, Build(input))
		}
	}
}

func Test_build_wildcard_alternative_returns_match_all(t *testing.T) {
	for _, input := range []string{"(golang|*)", "(*|golang)"} {
		if _, ok := Build(input).(*query.MatchAllQuery); !ok {
			t.Fatalf("Build(%q): expected *query.MatchAllQuery, got %T", input, Build(input))
		}
	}
}

func Test_build_simple_word_returns_boolean_query(t *testing.T) {
	bq := buildBoolQ(t, "golang")
	clauses := mustClauses(t, bq)
	if len(clauses) != 1 {
		t.Fatalf("expected 1 must clause, got %d", len(clauses))
	}
	dq := asDisjunction(t, clauses[0])
	if len(dq.Disjuncts) != freeTextDisjuncts {
		t.Fatalf("expected %d disjuncts, got %d", freeTextDisjuncts, len(dq.Disjuncts))
	}
}

func Test_build_negated_word(t *testing.T) {
	bq := buildBoolQ(t, "-golang")
	if bq.Must != nil {
		t.Fatalf("negated-only word: expected Must to be nil, got %T", bq.Must)
	}
	nots := mustNotClauses(t, bq)
	if len(nots) != 1 {
		t.Fatalf("expected 1 must_not clause, got %d", len(nots))
	}
	asDisjunction(t, nots[0])
}

func Test_build_quoted_phrase(t *testing.T) {
	bq := buildBoolQ(t, `"hello world"`)
	clauses := mustClauses(t, bq)
	if len(clauses) != 1 {
		t.Fatalf("expected 1 must clause, got %d", len(clauses))
	}
	dq := asDisjunction(t, clauses[0])
	if len(dq.Disjuncts) != 3 {
		t.Fatalf("expected 3 disjuncts (title, content, sourceText), got %d", len(dq.Disjuncts))
	}
	phrase := asMatchPhrase(t, dq.Disjuncts[0])
	if phrase.MatchPhrase != "hello world" {
		t.Fatalf("expected MatchPhrase %q, got %q", "hello world", phrase.MatchPhrase)
	}
	if phrase.FieldVal != "title" {
		t.Fatalf("expected field %q, got %q", "title", phrase.FieldVal)
	}
}

func Test_build_negated_quoted_phrase(t *testing.T) {
	bq := buildBoolQ(t, `"-hello world"`)
	if bq.Must != nil {
		t.Fatalf("negated-only phrase: expected Must to be nil, got %T", bq.Must)
	}
	nots := mustNotClauses(t, bq)
	if len(nots) != 1 {
		t.Fatalf("expected 1 must_not clause, got %d", len(nots))
	}
	dq := asDisjunction(t, nots[0])
	phrase := asMatchPhrase(t, dq.Disjuncts[0])
	if phrase.MatchPhrase != "hello world" {
		t.Fatalf("expected MatchPhrase %q, got %q", "hello world", phrase.MatchPhrase)
	}
}

func Test_build_text_field_uses_match_query(t *testing.T) {
	bq := buildBoolQ(t, "content:golang")
	clauses := mustClauses(t, bq)
	if len(clauses) != 1 {
		t.Fatalf("expected 1 must clause, got %d", len(clauses))
	}
	mq := asMatch(t, clauses[0])
	if mq.Match != "golang" {
		t.Fatalf("expected Match %q, got %q", "golang", mq.Match)
	}
	if mq.FieldVal != "content" {
		t.Fatalf("expected field %q, got %q", "content", mq.FieldVal)
	}
}

func Test_build_keyword_field_uses_term_query(t *testing.T) {
	bq := buildBoolQ(t, "kind:todo")
	clauses := mustClauses(t, bq)
	if len(clauses) != 1 {
		t.Fatalf("expected 1 must clause, got %d", len(clauses))
	}
	term := asTerm(t, clauses[0])
	if term.Term != "todo" {
		t.Fatalf("expected Term %q, got %q", "todo", term.Term)
	}
	if term.FieldVal != "kind" {
		t.Fatalf("expected field %q, got %q", "kind", term.FieldVal)
	}
}

func Test_build_keyword_field_is_lowercased(t *testing.T) {
	bq := buildBoolQ(t, "kind:Todo")
	term := asTerm(t, mustClauses(t, bq)[0])
	if term.Term != "todo" {
		t.Fatalf("expected Term %q, got %q", "todo", term.Term)
	}
}

func Test_build_unknown_field_falls_through_to_query_string(t *testing.T) {
	bq := buildBoolQ(t, "nope:value")
	clauses := mustClauses(t, bq)
	if len(clauses) != 1 {
		t.Fatalf("expected 1 must clause, got %d", len(clauses))
	}
	asDisjunction(t, clauses[0])
}

func Test_build_line_index_range(t *testing.T) {
	bq := buildBoolQ(t, "lineIndex:3")
	clauses := mustClauses(t, bq)
	if len(clauses) != 1 {
		t.Fatalf("expected 1 must clause, got %d", len(clauses))
	}
	if _, ok := clauses[0].(*query.NumericRangeQuery); !ok {
		t.Fatalf("expected *query.NumericRangeQuery, got %T", clauses[0])
	}
}

func Test_build_relative_time_filter_is_field_specific(t *testing.T) {
	bq := buildBoolQ(t, "updatedAt:>7d")
	clauses := mustClauses(t, bq)
	if len(clauses) != 1 {
		t.Fatalf("expected 1 must clause, got %d", len(clauses))
	}
	if _, ok := clauses[0].(*query.NumericRangeQuery); !ok {
		t.Fatalf("expected *query.NumericRangeQuery, got %T", clauses[0])
	}
}

func Test_build_absolute_date_filter(t *testing.T) {
	bq := buildBoolQ(t, "createdAt:>=2026-01-01")
	clauses := mustClauses(t, bq)
	if len(clauses) != 1 {
		t.Fatalf("expected 1 must clause, got %d", len(clauses))
	}
	if _, ok := clauses[0].(*query.NumericRangeQuery); !ok {
		t.Fatalf("expected *query.NumericRangeQuery, got %T", clauses[0])
	}
}

func Test_build_invalid_time_filter_falls_through(t *testing.T) {
	// An unparseable time value is not treated as a filter, so the token
	// degrades to a free-text search instead of a numeric range.
	bq := buildBoolQ(t, "updatedAt:yesterday")
	clauses := mustClauses(t, bq)
	if len(clauses) != 1 {
		t.Fatalf("expected 1 must clause, got %d", len(clauses))
	}
	dq := asDisjunction(t, clauses[0])
	if len(dq.Disjuncts) != freeTextDisjuncts {
		t.Fatalf("expected %d disjuncts, got %d", freeTextDisjuncts, len(dq.Disjuncts))
	}
}

func Test_build_wildcard_field(t *testing.T) {
	bq := buildBoolQ(t, "projectId:alpha*")
	clauses := mustClauses(t, bq)
	if len(clauses) != 1 {
		t.Fatalf("expected 1 must clause, got %d", len(clauses))
	}
	wq := asWildcard(t, clauses[0])
	if wq.Wildcard != "alpha*" {
		t.Fatalf("expected Wildcard %q, got %q", "alpha*", wq.Wildcard)
	}
}

func Test_build_alternation(t *testing.T) {
	bq := buildBoolQ(t, "(kind:todo|kind:comment)")
	clauses := mustClauses(t, bq)
	if len(clauses) != 1 {
		t.Fatalf("expected 1 must clause, got %d", len(clauses))
	}
	dq := asDisjunction(t, clauses[0])
	if len(dq.Disjuncts) != 2 {
		t.Fatalf("expected 2 disjuncts, got %d", len(dq.Disjuncts))
	}
}

func Test_build_multiple_tokens_positive_and_negative(t *testing.T) {
	bq := buildBoolQ(t, "golang -python")
	clauses := mustClauses(t, bq)
	if len(clauses) != 1 {
		t.Fatalf("expected 1 must clause, got %d", len(clauses))
	}
	nots := mustNotClauses(t, bq)
	if len(nots) != 1 {
		t.Fatalf("expected 1 must_not clause, got %d", len(nots))
	}
}

func Test_build_field_specific_skips_phrase_wrap(t *testing.T) {
	// When any token is field-specific the whole input is not wrapped in a
	// full-string phrase query, so the must clauses are the token queries.
	bq := buildBoolQ(t, "kind:todo golang")
	clauses := mustClauses(t, bq)
	if len(clauses) != 2 {
		t.Fatalf("expected 2 must clauses, got %d", len(clauses))
	}
	asTerm(t, clauses[0])
	asDisjunction(t, clauses[1])
}

func TestBuildTimestampRange(t *testing.T) {
	if _, ok := BuildTimestampRange("updatedAt", nil, nil, true, true); ok {
		t.Fatal("expected an open range to be rejected")
	}
	min := time.Now().Add(-7 * 24 * time.Hour).Unix()
	q, ok := BuildTimestampRange("updatedAt", &min, nil, false, true)
	if !ok {
		t.Fatal("expected a bounded range to build")
	}
	if _, ok := q.(*query.NumericRangeQuery); !ok {
		t.Fatalf("expected *query.NumericRangeQuery, got %T", q)
	}
}
