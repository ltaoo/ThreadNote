import {
  cancelMemoAgentRun,
  closeMemoAgent,
  createMemoAgentRun,
  createMemoAgentSession,
  loadMemoAgentRunEvents,
  loadMemoAgents,
} from "@/domain/memo-agent.js";
import { TimelessPrimitive } from "@/timeless-icons.js";

const DEFAULT_AGENTS = Object.freeze([
  Object.freeze({ id: "opencode", label: "OpenCode", value: "opencode" }),
]);
const POLL_INTERVAL = 120;

function normalize_agents(agents) {
  const seen_ids = new Set();
  return (Array.isArray(agents) ? agents : []).reduce(function (result, agent) {
    const agent_id = String((agent && agent.id) || "").trim();
    if (!agent_id || seen_ids.has(agent_id)) return result;
    seen_ids.add(agent_id);
    result.push({
      id: agent_id,
      label: String((agent && agent.label) || agent_id),
      value: agent_id,
    });
    return result;
  }, []);
}

function error_text(err) {
  return err && err.message ? err.message : String(err || "请求失败");
}

function default_wait_for_events() {
  return new Promise(function (resolve) {
    globalThis.setTimeout(resolve, POLL_INTERVAL);
  });
}

function ignore_service_error(callback) {
  try {
    Promise.resolve(callback()).catch(function () {});
  } catch (_) {}
}

export function ACPChatModel(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  if (!runtime?.defineModel || !runtime?.ref || !runtime?.refarr) {
    throw new Error("ACPChatModel requires the Timeless runtime");
  }

  const services = {
    cancelMemoAgentRun,
    closeMemoAgent,
    createMemoAgentRun,
    createMemoAgentSession,
    loadMemoAgentRunEvents,
    loadMemoAgents,
    waitForEvents: default_wait_for_events,
    ...(props.services || {}),
  };
  const debug = typeof props.debug === "function" ? props.debug : function () {};
  const active_run_id_ = runtime.ref("");
  const agent_id_ = runtime.ref("opencode");
  const agents_ = runtime.refarr(DEFAULT_AGENTS.slice());
  const agents_ready_ = runtime.ref(false);
  const busy_ = runtime.ref(false);
  const error_ = runtime.ref("");
  const focus_request_ = runtime.ref(0);
  const input_ = runtime.ref("");
  const messages_ = runtime.refarr([]);
  const session_id_ = runtime.ref("");
  const status_ = runtime.ref("尚未连接");
  let destroyed_ = false;
  let message_sequence_ = 0;

  function next_message_id(role) {
    message_sequence_ += 1;
    return role + "-" + message_sequence_;
  }

  function request_input_focus() {
    focus_request_.as(focus_request_.value + 1);
  }

  function set_error(err) {
    if (!destroyed_) error_.as(error_text(err));
  }

  function set_busy(value) {
    if (destroyed_) return;
    const busy = Boolean(value);
    busy_.as(busy);
    status_.as(busy ? "运行中" : session_id_.value ? "对话已连接" : "尚未连接");
  }

  function update_message(message_id, patch) {
    if (destroyed_) return;
    messages_.as(
      messages_.value.map(function (message) {
        return message.id === message_id ? { ...message, ...patch } : message;
      }),
    );
  }

  async function follow_run(run_id, message_id) {
    let after_id = 0;
    let raw = "";
    let polling_round = 0;
    const started_at = Date.now();
    let warning_logged = false;

    debug("start followRun", { runId: run_id });
    while (!destroyed_ && active_run_id_.value === run_id) {
      polling_round += 1;
      const data = await services.loadMemoAgentRunEvents(run_id, after_id);
      if (destroyed_ || active_run_id_.value !== run_id) return false;
      const events = Array.isArray(data && data.events) ? data.events : [];
      const elapsed_ms = Date.now() - started_at;
      debug("poll result", {
        afterIdBefore: after_id,
        done: Boolean(data && data.done),
        elapsedMs: elapsed_ms,
        eventCount: events.length,
        round: polling_round,
        runId: run_id,
      });
      if (!warning_logged && elapsed_ms >= 60000 && !(data && data.done)) {
        warning_logged = true;
        debug("run timeout warning", {
          elapsedMs: elapsed_ms,
          lastAfterId: after_id,
          lastEventCount: events.length,
          runId: run_id,
        });
      }

      for (const event of events) {
        after_id = Math.max(after_id, Number((event && event.id) || 0));
        const payload =
          event && event.data && typeof event.data === "object" ? event.data : {};
        debug("event in", {
          eventId: Number((event && event.id) || 0),
          eventType: event && event.type,
          hasData: Boolean(event && event.data != null),
          runId: run_id,
        });
        if (event.type === "message.delta") {
          raw += String(payload.text || "");
          update_message(message_id, { text: raw });
          continue;
        }
        if (event.type === "status") {
          status_.as(String(payload.text || payload.status || "Agent 正在思考…"));
          continue;
        }
        if (event.type === "message.completed") {
          if (payload.content != null) {
            update_message(message_id, { text: String(payload.content) });
          } else if (payload.message != null) {
            update_message(message_id, { text: String(payload.message) });
          }
          continue;
        }
        if (event.type === "run.completed") {
          const current_message = messages_.value.find(function (message) {
            return message.id === message_id;
          });
          if (payload.stopReason === "cancelled") {
            update_message(message_id, {
              text: (current_message && current_message.text) || "已取消",
            });
          } else if (payload.content != null) {
            update_message(message_id, { text: String(payload.content) });
          } else if (payload.message != null) {
            update_message(message_id, { text: String(payload.message) });
          }
          continue;
        }
        if (event.type === "run.failed") {
          throw new Error(payload.message || "ACP 对话失败");
        }
      }

      if (data && data.done) {
        update_message(message_id, { streaming: false });
        active_run_id_.as("");
        set_busy(false);
        return true;
      }
      await services.waitForEvents();
    }
    return false;
  }

  const state = {
    activeRunId: active_run_id_,
    agentId: agent_id_,
    agents: agents_,
    agentsReady: agents_ready_,
    busy: busy_,
    error: error_,
    focusRequest: focus_request_,
    input: input_,
    messages: messages_,
    sessionId: session_id_,
    status: status_,
  };

  const methods = {
    async cancel() {
      const run_id = active_run_id_.value;
      if (destroyed_ || !run_id) return false;
      status_.as("正在取消…");
      try {
        await services.cancelMemoAgentRun(run_id);
        return true;
      } catch (err) {
        set_error(err);
        return false;
      }
    },

    async init() {
      if (destroyed_) return false;
      try {
        const agents = normalize_agents(await services.loadMemoAgents());
        if (destroyed_) return false;
        if (agents.length > 0) {
          agents_.as(agents);
          if (!agents.some(function (agent) { return agent.id === agent_id_.value; })) {
            agent_id_.as(agents[0].id);
          }
        }
        return true;
      } catch (err) {
        set_error(err);
        return false;
      } finally {
        if (!destroyed_) agents_ready_.as(true);
      }
    },

    async newConversation() {
      if (destroyed_ || busy_.value) return false;
      const previous_session_id = session_id_.value;
      session_id_.as("");
      messages_.as([]);
      error_.as("");
      set_busy(false);
      request_input_focus();
      if (!previous_session_id) return true;
      try {
        await services.closeMemoAgent(previous_session_id);
        return true;
      } catch (err) {
        set_error(err);
        return false;
      }
    },

    setAgent(agent_id) {
      if (destroyed_ || busy_.value || session_id_.value) return;
      const value = String(agent_id || "");
      if (agents_.value.some(function (agent) { return agent.id === value; })) {
        agent_id_.as(value);
      }
    },

    setInput(input) {
      if (!destroyed_ && !busy_.value) input_.as(String(input || ""));
    },

    async send() {
      if (destroyed_ || busy_.value) return false;
      const content = String(input_.value || "").trim();
      if (!content) {
        set_error(new Error("请输入消息"));
        request_input_focus();
        return false;
      }

      const user_message = {
        error: false,
        id: next_message_id("user"),
        role: "user",
        streaming: false,
        text: content,
      };
      const assistant_message = {
        error: false,
        id: next_message_id("assistant"),
        role: "assistant",
        streaming: true,
        text: "",
      };
      messages_.as(messages_.value.concat(user_message, assistant_message));
      input_.as("");
      error_.as("");
      set_busy(true);

      try {
        let session_id = session_id_.value;
        if (!session_id) {
          const session = await services.createMemoAgentSession({
            agentId: agent_id_.value || "opencode",
            mode: "chat",
          });
          if (destroyed_) return false;
          session_id = String((session && session.sessionId) || "");
          if (!session_id) throw new Error("ACP 会话未返回 sessionId");
          session_id_.as(session_id);
          debug("session ready", { agentId: session && session.agentId, sessionId: session_id });
        }

        const run = await services.createMemoAgentRun({
          instruction: content,
          sessionId: session_id,
        });
        if (destroyed_) return false;
        const run_id = String((run && run.runId) || "");
        if (!run_id) throw new Error("ACP 运行未返回 runId");
        active_run_id_.as(run_id);
        debug("run created", { runId: run_id, sessionId: session_id });
        return await follow_run(run_id, assistant_message.id);
      } catch (err) {
        if (destroyed_) return false;
        update_message(assistant_message.id, {
          error: true,
          streaming: false,
          text:
            messages_.value.find(function (message) {
              return message.id === assistant_message.id;
            })?.text || "生成失败",
        });
        active_run_id_.as("");
        set_busy(false);
        set_error(err);
        return false;
      }
    },
  };

  const model = runtime.defineModel({ state, methods });
  const destroy_model = model.destroy.bind(model);
  model.destroy = function () {
    if (destroyed_) return;
    destroyed_ = true;
    const run_id = active_run_id_.value;
    const session_id = session_id_.value;
    if (run_id) {
      ignore_service_error(function () {
        return services.cancelMemoAgentRun(run_id);
      });
    }
    if (session_id) {
      ignore_service_error(function () {
        return services.closeMemoAgent(session_id);
      });
    }
    destroy_model();
  };
  return model;
}
