package service

import (
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
)

func TestApplyTrayVisibilitySerializesUpdates(t *testing.T) {
	previous_handler := tray_visibility_handler
	t.Cleanup(func() { tray_visibility_handler = previous_handler })
	var active_calls atomic.Int32
	var completed_calls atomic.Int32
	var overlapping_calls atomic.Bool
	tray_visibility_handler = func(_ bool) {
		if active_calls.Add(1) != 1 {
			overlapping_calls.Store(true)
		}
		runtime.Gosched()
		active_calls.Add(-1)
		completed_calls.Add(1)
	}
	var pending sync.WaitGroup
	for index := 0; index < 32; index++ {
		pending.Add(1)
		go func(visible bool) {
			defer pending.Done()
			apply_tray_visibility(visible)
		}(index%2 == 0)
	}
	pending.Wait()
	if overlapping_calls.Load() || completed_calls.Load() != 32 {
		t.Fatalf("tray updates overlapped or were lost: overlap=%v completed=%d", overlapping_calls.Load(), completed_calls.Load())
	}
}
