package transport

import (
	"bufio"
	"encoding/json"
	"io"
	"sync"
)

// NDJSONStream reads and writes JSON messages over newline-delimited JSON.
// Messages are delivered as raw json.RawMessage on the Messages channel.
type NDJSONStream struct {
	scanner  *bufio.Scanner
	writer   io.Writer
	mu       sync.Mutex
	messages chan json.RawMessage
	done     chan struct{}
	err      error
}

// NewNDJSONStream creates a new NDJSON stream over the given reader and writer.
func NewNDJSONStream(r io.Reader, w io.Writer) *NDJSONStream {
	s := &NDJSONStream{
		scanner:  bufio.NewScanner(r),
		writer:   w,
		messages: make(chan json.RawMessage, 256),
		done:     make(chan struct{}),
	}
	// Set a 10MB buffer for large messages.
	s.scanner.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)

	go s.readLoop()
	return s
}

// Messages returns the channel that receives parsed JSON messages.
func (s *NDJSONStream) Messages() <-chan json.RawMessage {
	return s.messages
}

// Done returns a channel that is closed when the stream is done.
func (s *NDJSONStream) Done() <-chan struct{} {
	return s.done
}

// Err returns the error that caused the stream to close (if any).
func (s *NDJSONStream) Err() error {
	return s.err
}

func (s *NDJSONStream) readLoop() {
	defer close(s.messages)
	defer close(s.done)

	for s.scanner.Scan() {
		line := s.scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		// Copy the line since scanner reuses the buffer.
		msg := make(json.RawMessage, len(line))
		copy(msg, line)
		s.messages <- msg
	}
	if err := s.scanner.Err(); err != nil {
		s.err = err
	}
}

// Write sends a value as a single NDJSON line.
func (s *NDJSONStream) Write(msg interface{}) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	data = append(data, '\n')
	_, err = s.writer.Write(data)
	return err
}
