package querybuilder

import (
	"fmt"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"example/simple/internal/search/searchschema"

	"github.com/blevesearch/bleve/v2"
	"github.com/blevesearch/bleve/v2/search/query"
)

var (
	relativeTimeFilterPattern = regexp.MustCompile(`^(<=|>=|<|>)([0-9]+)([smhdw])$`)
	absoluteDateFilterPattern = regexp.MustCompile(`^(<=|>=|<|>)([0-9]{4}-[0-9]{2}-[0-9]{2})$`)
)

// BuildValidated builds a query and reports a syntax error when the query
// string cannot be tokenized (an unclosed quote or alternation). Build itself
// falls back to a lenient query-string query in that case.
func BuildValidated(s string) (query.Query, error) {
	if _, err := Tokenize(s); err != nil {
		return nil, fmt.Errorf("invalid search query: %w", err)
	}
	return Build(s), nil
}

// Build turns a search string into a Bleve query. An empty string matches
// nothing; the standalone token * matches everything.
func Build(s string) query.Query {
	if strings.TrimSpace(s) == "" {
		return query.NewMatchNoneQuery()
	}

	qt, err := Tokenize(s)
	if err != nil {
		return createSimpleQuery(s)
	}
	if slices.ContainsFunc(qt, isNegatedStandaloneWildcard) {
		return query.NewMatchNoneQuery()
	}
	qt = slices.DeleteFunc(qt, isMatchAllToken)
	if len(qt) == 0 {
		return query.NewMatchAllQuery()
	}

	qs := []query.Query{}
	nqs := []query.Query{}
	now := time.Now()

	for _, t := range qt {
		q, negated := getTokenQuery(t, now)
		if negated {
			nqs = append(nqs, q)
		} else {
			qs = append(qs, q)
		}
	}
	if len(qt) > 1 && !anyFieldSpecific(qt) {
		// Also try the whole query string as a phrase so that multi-word
		// searches still surface documents containing the exact phrasing.
		pq := createCombinedMatchQuery(s, 2)
		qs = []query.Query{
			bleve.NewDisjunctionQuery(
				bleve.NewConjunctionQuery(qs...),
				pq,
			),
		}
	}
	return query.NewBooleanQuery(qs, nil, nqs)
}

func isStandaloneWildcard(t Token) bool {
	return t.Type == TokenWord && t.Value == "*"
}

func isMatchAllToken(t Token) bool {
	if isStandaloneWildcard(t) {
		return true
	}
	return t.Type == TokenAlternation && slices.ContainsFunc(t.Parts, isStandaloneWildcard)
}

func isNegatedStandaloneWildcard(t Token) bool {
	return t.Type == TokenWord && t.Value == "-*"
}

// anyFieldSpecific returns true when at least one token is an explicit field
// query. Wrapping the whole input in a phrase query would then be wrong.
func anyFieldSpecific(qt []Token) bool {
	return slices.ContainsFunc(qt, isFieldSpecific)
}

// isFieldSpecific reports whether t carries an explicit field: prefix and
// therefore targets a field rather than free text.
func isFieldSpecific(t Token) bool {
	v := t.Value
	switch t.Type {
	case TokenWord, TokenQuoted:
		v = strings.TrimPrefix(v, "-")
		field, value, ok := fieldFilterValue(v)
		if !ok {
			return false
		}
		if field.Kind == searchschema.FieldKindTime {
			return validTimeFilter(value)
		}
		return true
	}
	return false
}

func createSimpleQuery(s string) query.Query {
	return bleve.NewQueryStringQuery(s)
}

func createCombinedMatchQuery(s string, boost float64) query.Query {
	q := bleve.NewDisjunctionQuery(
		createMatchPhraseQuery(s, boost*10),
		createMatchQuery(s, boost),
	)
	q.SetBoost(boost)
	return q
}

// createMatchQuery matches all terms of the query against each default-search
// field (AND semantics per field).
func createMatchQuery(s string, boost float64) query.Query {
	queries := make([]query.Query, 0)
	for _, field := range searchschema.Fields() {
		if !field.DefaultSearch {
			continue
		}
		match := bleve.NewMatchQuery(s)
		match.SetField(field.IndexField)
		match.SetBoost(field.Weight)
		match.Operator = query.MatchQueryOperatorAnd
		queries = append(queries, match)
	}
	q := bleve.NewDisjunctionQuery(queries...)
	q.SetBoost(boost)
	return q
}

// createMatchPhraseQuery matches exact phrases.
func createMatchPhraseQuery(s string, boost float64) query.Query {
	queries := make([]query.Query, 0)
	for _, field := range searchschema.Fields() {
		if !field.DefaultSearch {
			continue
		}
		match := bleve.NewMatchPhraseQuery(s)
		match.SetField(field.IndexField)
		match.SetBoost(field.Weight)
		queries = append(queries, match)
	}
	q := bleve.NewDisjunctionQuery(queries...)
	q.SetBoost(boost)
	return q
}

// buildFieldQuery creates the Bleve query for a named field and value.
// Keyword fields use an exact term query (the index lowercases keyword values),
// wildcard values become wildcard queries, and everything else is analyzed.
func buildFieldQuery(field, v string) query.Query {
	definition, ok := searchschema.Field(field)
	if !ok {
		return bleve.NewQueryStringQuery(v)
	}
	if strings.Contains(v, "*") {
		q := bleve.NewWildcardQuery(strings.ToLower(v))
		q.SetField(definition.IndexField)
		q.SetBoost(definition.Weight)
		return q
	}
	if definition.Kind == searchschema.FieldKindKeyword {
		q := bleve.NewTermQuery(strings.ToLower(v))
		q.SetField(definition.IndexField)
		q.SetBoost(definition.Weight)
		return q
	}
	q := bleve.NewMatchQuery(v)
	q.SetField(definition.IndexField)
	q.SetBoost(definition.Weight)
	return q
}

// buildQuotedFieldQuery preserves phrase semantics for analyzed text fields.
func buildQuotedFieldQuery(field, v string) query.Query {
	definition, ok := searchschema.Field(field)
	if ok && definition.Phrase {
		q := bleve.NewMatchPhraseQuery(v)
		q.SetField(definition.IndexField)
		q.SetBoost(definition.Weight)
		return q
	}
	return buildFieldQuery(field, v)
}

func fieldFilterValue(value string) (searchschema.FieldDefinition, string, bool) {
	name, filterValue, ok := strings.Cut(value, ":")
	if !ok {
		return searchschema.FieldDefinition{}, "", false
	}
	field, ok := searchschema.Field(name)
	return field, filterValue, ok
}

func buildIntegerQuery(field searchschema.FieldDefinition, v string) (query.Query, bool) {
	number, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return nil, false
	}
	min_inclusive, max_inclusive := true, true
	q := bleve.NewNumericRangeInclusiveQuery(&number, &number, &min_inclusive, &max_inclusive)
	q.SetField(field.IndexField)
	return q, true
}

func parseRelativeTimeFilter(v string) (string, int64, bool) {
	parts := relativeTimeFilterPattern.FindStringSubmatch(strings.ToLower(v))
	if parts == nil {
		return "", 0, false
	}
	amount, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		return "", 0, false
	}
	var unitSeconds int64
	switch parts[3] {
	case "s":
		unitSeconds = 1
	case "m":
		unitSeconds = 60
	case "h":
		unitSeconds = 60 * 60
	case "d":
		unitSeconds = 24 * 60 * 60
	case "w":
		unitSeconds = 7 * 24 * 60 * 60
	default:
		return "", 0, false
	}
	if amount > (1<<63-1)/unitSeconds {
		return "", 0, false
	}
	return parts[1], amount * unitSeconds, true
}

func parseAbsoluteDateFilter(v string) (string, int64, bool) {
	parts := absoluteDateFilterPattern.FindStringSubmatch(v)
	if parts == nil {
		return "", 0, false
	}
	date, err := time.Parse("2006-01-02", parts[2])
	if err != nil {
		return "", 0, false
	}
	return parts[1], date.Unix(), true
}

func validTimeFilter(v string) bool {
	if _, _, ok := parseRelativeTimeFilter(v); ok {
		return true
	}
	_, _, ok := parseAbsoluteDateFilter(v)
	return ok
}

// BuildTimestampRange creates an inclusive timestamp range for an indexed time
// field.
func BuildTimestampRange(field string, min, max *int64, minInclusive, maxInclusive bool) (query.Query, bool) {
	definition, ok := searchschema.Field(field)
	if !ok || definition.Kind != searchschema.FieldKindTime || (min == nil && max == nil) {
		return nil, false
	}
	var minValue, maxValue *float64
	if min != nil {
		minValue = new(float64)
		*minValue = float64(*min)
	}
	if max != nil {
		maxValue = new(float64)
		*maxValue = float64(*max)
	}
	q := bleve.NewNumericRangeInclusiveQuery(minValue, maxValue, &minInclusive, &maxInclusive)
	q.SetField(definition.IndexField)
	return q, true
}

func buildTimeQuery(fieldName, v string, now time.Time) (query.Query, bool) {
	field, ok := searchschema.Field(fieldName)
	if !ok || field.Kind != searchschema.FieldKindTime {
		return nil, false
	}
	comparison, durationSeconds, relative := parseRelativeTimeFilter(v)
	var cutoff int64
	if relative {
		cutoff = now.Unix() - durationSeconds
		switch comparison {
		case ">":
			comparison = "<"
		case ">=":
			comparison = "<="
		case "<":
			comparison = ">"
		case "<=":
			comparison = ">="
		}
	} else {
		var timestamp int64
		var ok bool
		comparison, timestamp, ok = parseAbsoluteDateFilter(v)
		if !ok {
			return nil, false
		}
		cutoff = timestamp
	}
	var min, max *int64
	minInclusive := true
	maxInclusive := true
	switch comparison {
	case ">":
		min = &cutoff
		minInclusive = false
	case ">=":
		min = &cutoff
	case "<":
		max = &cutoff
		maxInclusive = false
	case "<=":
		max = &cutoff
	default:
		return nil, false
	}
	return BuildTimestampRange(field.Name, min, max, minInclusive, maxInclusive)
}

func buildFieldAlternationQuery(field, value string, now time.Time) (query.Query, bool) {
	if !strings.HasPrefix(value, "(") || !strings.HasSuffix(value, ")") {
		return nil, false
	}
	parts, err := parseAlternationParts(value[1 : len(value)-1])
	if err != nil || len(parts) == 0 {
		return nil, false
	}
	queries := make([]query.Query, 0, len(parts))
	for _, part := range parts {
		partQuery, _ := getTokenQuery(Token{Type: TokenWord, Value: field + ":" + part.Value}, now)
		queries = append(queries, partQuery)
	}
	if len(queries) == 1 {
		return queries[0], true
	}
	return bleve.NewDisjunctionQuery(queries...), true
}

func getTokenQuery(t Token, now time.Time) (query.Query, bool) {
	negated := false
	switch t.Type {
	case TokenQuoted:
		v := t.Value
		if strings.HasPrefix(v, "-") {
			negated = true
			v = v[1:]
		}
		field, value, hasField := fieldFilterValue(v)
		if hasField && (field.Kind == searchschema.FieldKindText || field.Kind == searchschema.FieldKindKeyword) {
			v := value
			if strings.HasPrefix(v, "-") && len(v) > 1 {
				negated = true
				v = v[1:]
			}
			return buildQuotedFieldQuery(field.Name, v), negated
		}
		return createMatchPhraseQuery(v, 1), negated
	case TokenWord:
		if strings.HasPrefix(t.Value, "-") && len(t.Value) > 1 {
			negated = true
			t.Value = t.Value[1:]
		}
		if t.Value == "*" {
			return query.NewMatchAllQuery(), negated
		}
		field, v, hasField := fieldFilterValue(t.Value)
		if hasField {
			if q, ok := buildFieldAlternationQuery(field.Name, v, now); ok {
				return q, negated
			}
			switch field.Kind {
			case searchschema.FieldKindInteger:
				if q, ok := buildIntegerQuery(field, v); ok {
					return q, negated
				}
			case searchschema.FieldKindTime:
				if q, ok := buildTimeQuery(field.Name, v, now); ok {
					return q, negated
				}
			}
		}
		if hasField && (field.Kind == searchschema.FieldKindText || field.Kind == searchschema.FieldKindKeyword) {
			if strings.HasPrefix(v, "-") && len(v) > 1 {
				negated = true
				v = v[1:]
			}
			return buildFieldQuery(field.Name, v), negated
		}

		qs := []query.Query{}
		wcq := t.Value
		if !strings.HasPrefix(wcq, "*") {
			wcq = "*" + wcq
		}
		if !strings.HasSuffix(wcq, "*") {
			wcq = wcq + "*"
		}
		for _, field := range searchschema.Fields() {
			if field.DefaultSearch {
				qs = append(qs, buildFieldQuery(field.Name, t.Value))
			}
			// Also match fragments inside Latin words, URLs, and identifiers.
			if field.DefaultSearch || field.DefaultWildcard {
				qs = append(qs, buildFieldQuery(field.Name, wcq))
			}
		}
		return bleve.NewDisjunctionQuery(qs...), negated

	case TokenAlternation:
		qs := []query.Query{}
		for _, p := range t.Parts {
			r, _ := getTokenQuery(p, now)
			qs = append(qs, r)
		}
		return bleve.NewDisjunctionQuery(qs...), negated
	}
	return bleve.NewQueryStringQuery(t.Value), negated
}
