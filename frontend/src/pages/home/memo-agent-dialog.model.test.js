import assert from "node:assert/strict";
import test from "node:test";

import {
  MemoAgentDialogModel,
  memoAgentStreamText,
} from "./memo-agent-dialog.model.js";

function create_ref(initial_value) {
  let value_ = initial_value;
  const listeners_ = new Set();
  return {
    get value() {
      return value_;
    },
    as(next_value) {
      value_ = typeof next_value === "function" ? next_value(value_) : next_value;
      listeners_.forEach(function (listener) {
        listener(value_);
      });
    },
    destroy() {
      listeners_.clear();
    },
    subscribe(listener) {
      const callback = listener.onChange || listener;
      listeners_.add(callback);
      return function () {
        listeners_.delete(callback);
      };
    },
  };
}

function create_runtime() {
  return {
    defineModel(config) {
      return {
        ...config,
        destroy() {
          Object.values(config.state).forEach(function (value) {
            value.destroy?.();
          });
        },
      };
    },
    ref: create_ref,
    refarr: create_ref,
  };
}

function base_services(overrides = {}) {
  return {
    async cancelMemoAgentRun() {},
    async closeMemoAgent() {},
    async createMemoAgentRun() {
      return { runId: "run-1" };
    },
    async createMemoAgentSession() {
      return { sessionId: "session-1" };
    },
    async loadMemoAgentRunEvents() {
      return { done: true, events: [] };
    },
    async loadMemoAgents() {
      return [{ id: "opencode", label: "OpenCode" }];
    },
    async waitForEvents() {},
    ...overrides,
  };
}

test("memo agent stream text exposes only the replacement body", function () {
  assert.equal(
    memoAgentStreamText(
      "reasoning\n<<<VELO_REPLACEMENT>>>\nnew memo<<<VELO_REPLACEMENT_END>>>tail",
    ),
    "new memo",
  );
});

test("dialog model loads providers into reactive state", async function () {
  const model = MemoAgentDialogModel({
    runtime: create_runtime(),
    services: base_services({
      async loadMemoAgents() {
        return [
          { id: "claude", label: "Claude" },
          { id: "claude", label: "Duplicate" },
        ];
      },
    }),
  });

  assert.equal(await model.methods.init(), true);
  assert.deepEqual(model.state.agents.value, [
    { id: "claude", label: "Claude", value: "claude" },
  ]);
  assert.equal(model.state.agentId.value, "claude");
  assert.equal(model.state.agentsReady.value, true);
  model.destroy();
});

test("dialog model owns session creation, streaming, and replacement state", async function () {
  const calls = [];
  let poll_count = 0;
  const model = MemoAgentDialogModel({
    runtime: create_runtime(),
    selection: "old memo",
    services: base_services({
      async createMemoAgentRun(input) {
        calls.push(["run", input]);
        return { runId: "run-7" };
      },
      async createMemoAgentSession(input) {
        calls.push(["session", input]);
        return { sessionId: "session-7" };
      },
      async loadMemoAgentRunEvents(run_id, after_id) {
        calls.push(["events", run_id, after_id]);
        poll_count += 1;
        if (poll_count === 1) {
          return {
            done: false,
            events: [
              {
                data: { text: "thinking<<<VELO_REPLACEMENT>>>\nnew" },
                id: 4,
                type: "message.delta",
              },
            ],
          };
        }
        return {
          done: true,
          events: [
            {
              data: { replacement: "new memo", stopReason: "end_turn" },
              id: 5,
              type: "run.completed",
            },
          ],
        };
      },
    }),
  });

  model.methods.setInstruction("  make it concise  ");
  assert.equal(await model.methods.send(), true);

  assert.deepEqual(calls[0], [
    "session",
    { agentId: "opencode", mode: "memo-edit", selection: "old memo" },
  ]);
  assert.deepEqual(calls[1], [
    "run",
    { instruction: "make it concise", sessionId: "session-7" },
  ]);
  assert.deepEqual(calls[2], ["events", "run-7", 0]);
  assert.deepEqual(calls[3], ["events", "run-7", 4]);
  assert.equal(model.state.candidate.value, "new memo");
  assert.equal(model.state.hasCandidate.value, true);
  assert.equal(model.state.busy.value, false);
  assert.equal(model.state.activeRunId.value, "");
  assert.equal(model.state.messages.value[1].text, "new memo");
  assert.equal(model.state.messages.value[1].streaming, false);
  model.destroy();
});

test("dialog model keeps validation and run failures in state", async function () {
  const model = MemoAgentDialogModel({
    runtime: create_runtime(),
    services: base_services({
      async createMemoAgentSession() {
        throw new Error("provider unavailable");
      },
    }),
  });

  assert.equal(await model.methods.send(), false);
  assert.equal(model.state.error.value, "请输入修改要求");
  assert.equal(model.state.focusRequest.value, 1);

  model.methods.setInstruction("rewrite");
  assert.equal(await model.methods.send(), false);
  assert.equal(model.state.error.value, "provider unavailable");
  assert.equal(model.state.busy.value, false);
  assert.deepEqual(
    model.state.messages.value.map(function (message) {
      return message.role;
    }),
    ["user"],
  );
  model.destroy();
});

test("dialog model applies candidates and guards idle-only close routes", function () {
  const closes = [];
  const replacements = [];
  const model = MemoAgentDialogModel({
    onRequestClose(reason) {
      closes.push(reason);
    },
    replace(value) {
      replacements.push(value);
      return true;
    },
    runtime: create_runtime(),
    selection: "candidate",
    services: base_services(),
  });

  model.state.busy.as(true);
  assert.equal(model.methods.requestClose("escape"), false);
  assert.equal(model.methods.requestClose("backdrop"), false);
  assert.equal(model.methods.requestClose("close-button"), true);
  model.state.busy.as(false);
  assert.equal(model.methods.applyCandidate(), true);

  assert.deepEqual(replacements, ["candidate"]);
  assert.deepEqual(closes, ["close-button", "apply"]);
  model.destroy();
});

test("destroy cancels the active run and closes its session", async function () {
  const cancelled_runs = [];
  const closed_sessions = [];
  let resolve_events;
  const events_pending = new Promise(function (resolve) {
    resolve_events = resolve;
  });
  const model = MemoAgentDialogModel({
    runtime: create_runtime(),
    services: base_services({
      async cancelMemoAgentRun(run_id) {
        cancelled_runs.push(run_id);
      },
      async closeMemoAgent(session_id) {
        closed_sessions.push(session_id);
      },
      loadMemoAgentRunEvents() {
        return events_pending;
      },
    }),
  });

  model.methods.setInstruction("rewrite");
  const send_promise = model.methods.send();
  await new Promise(function (resolve) {
    globalThis.setTimeout(resolve, 0);
  });
  model.destroy();
  resolve_events({ done: true, events: [] });
  assert.equal(await send_promise, false);
  await new Promise(function (resolve) {
    globalThis.setTimeout(resolve, 0);
  });

  assert.deepEqual(cancelled_runs, ["run-1"]);
  assert.deepEqual(closed_sessions, ["session-1"]);
});
