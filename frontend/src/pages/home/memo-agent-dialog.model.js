import {
  cancelMemoAgentRun,
  closeMemoAgent,
  createMemoAgentRun,
  createMemoAgentSession,
  loadMemoAgentRunEvents,
  loadMemoAgents,
} from "@/domain/memo-agent.js";

const DEFAULT_AGENTS = Object.freeze([
  Object.freeze({ id: "opencode", label: "OpenCode" }),
]);
const POLL_INTERVAL = 120;

function error_text(err) {
  return err && err.message ? err.message : String(err || "请求失败");
}

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

export function memoAgentStreamText(value) {
  const start_marker = "<<<VELO_REPLACEMENT>>>";
  const end_marker = "<<<VELO_REPLACEMENT_END>>>";
  let text = String(value || "");
  const start = text.lastIndexOf(start_marker);
  if (start >= 0) {
    text = text.slice(start + start_marker.length).replace(/^\r?\n/, "");
  }
  const end = text.indexOf(end_marker);
  if (end >= 0) text = text.slice(0, end);
  return text;
}

export function MemoAgentDialogModel(props = {}) {

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
  const initial_candidate = String(props.selection || "");
  const initial_agents = normalize_agents(DEFAULT_AGENTS);
  const agent_id_ = ref("opencode");
  const agents_ready_ = ref(false);
  const agents_ = refarr(initial_agents);
  const active_run_id_ = ref("");
  const busy_ = ref(false);
  const candidate_ = ref(initial_candidate);
  const error_ = ref("");
  const focus_request_ = ref(0);
  const has_candidate_ = ref(initial_candidate.length > 0);
  const instruction_ = ref("");
  const messages_ = refarr([]);
  const session_id_ = ref("");
  let destroyed_ = false;
  let message_sequence_ = 0;

  const state = {
    activeRunId: active_run_id_,
    agentId: agent_id_,
    agentsReady: agents_ready_,
    agents: agents_,
    busy: busy_,
    candidate: candidate_,
    error: error_,
    focusRequest: focus_request_,
    hasCandidate: has_candidate_,
    instruction: instruction_,
    messages: messages_,
    sessionId: session_id_,
  };

  function next_message_id(role) {
    message_sequence_ += 1;
    return role + "-" + message_sequence_;
  }

  function request_instruction_focus() {
    focus_request_.as(focus_request_.value + 1);
  }

  function set_error(err) {
    if (!destroyed_) error_.as(error_text(err));
  }

  function update_message(message_id, patch) {
    if (destroyed_) return;
    messages_.as(
      messages_.value.map(function (message) {
        return message.id === message_id ? { ...message, ...patch } : message;
      }),
    );
  }

  function remove_empty_agent_message(message_id) {
    const message = messages_.value.find(function (item) {
      return item.id === message_id;
    });
    if (message && !message.text) {
      messages_.as(
        messages_.value.filter(function (item) {
          return item.id !== message_id;
        }),
      );
    }
  }

  async function follow_run(run_id, message_id) {
    let after_id = 0;
    let raw = "";

    while (!destroyed_ && active_run_id_.value === run_id) {
      const data = await services.loadMemoAgentRunEvents(run_id, after_id);
      if (destroyed_ || active_run_id_.value !== run_id) return false;
      const events = Array.isArray(data && data.events) ? data.events : [];

      events.forEach(function (event) {
        after_id = Math.max(after_id, Number(event.id || 0));
        const payload =
          event.data && typeof event.data === "object" ? event.data : {};
        if (event.type === "message.delta") {
          raw += String(payload.text || "");
          update_message(message_id, {
            text: memoAgentStreamText(raw) || "正在生成…",
          });
          return;
        }
        if (event.type === "run.completed") {
          if (
            payload.stopReason !== "cancelled" &&
            payload.replacement != null
          ) {
            const replacement = String(payload.replacement);
            candidate_.as(replacement);
            has_candidate_.as(true);
            update_message(message_id, { text: replacement });
          }
          return;
        }
        if (event.type === "run.failed") {
          throw new Error(payload.message || "Agent 对话失败");
        }
      });

      if (data && data.done) {
        update_message(message_id, { streaming: false });
        active_run_id_.as("");
        busy_.as(false);
        return true;
      }
      await services.waitForEvents();
    }
    return false;
  }

  const methods = {
    applyCandidate() {
      if (destroyed_ || busy_.value) return false;
      if (
        has_candidate_.value &&
        typeof props.replace === "function" &&
        props.replace(candidate_.value) !== false
      ) {
        methods.requestClose("apply");
        return true;
      }
      set_error(new Error("原选区已经变化，请重新选择内容"));
      return false;
    },

    async init() {
      if (destroyed_) return false;
      try {
        const loaded_agents = normalize_agents(await services.loadMemoAgents());
        if (destroyed_) return false;
        if (loaded_agents.length > 0) {
          agents_.as(loaded_agents);
          const selected_exists = loaded_agents.some(function (agent) {
            return agent.id === agent_id_.value;
          });
          if (!selected_exists) agent_id_.as(loaded_agents[0].id);
        }
        return true;
      } catch (err) {
        set_error(err);
        return false;
      } finally {
        if (!destroyed_) agents_ready_.as(true);
      }
    },

    requestClose(reason = "close-button") {
      if (destroyed_) return false;
      if (busy_.value && ["backdrop", "escape"].includes(reason)) {
        return false;
      }
      if (typeof props.onRequestClose === "function") {
        props.onRequestClose(reason);
      }
      return true;
    },

    setAgent(agent_id) {
      if (destroyed_ || busy_.value) return;
      const value = String(agent_id || "");
      const exists = agents_.value.some(function (agent) {
        return agent.id === value;
      });
      if (exists) agent_id_.as(value);
    },

    setInstruction(instruction) {
      if (!destroyed_ && !busy_.value) {
        instruction_.as(String(instruction || ""));
      }
    },

    async send() {
      if (destroyed_ || busy_.value) return false;
      const instruction = String(instruction_.value || "").trim();
      if (!instruction) {
        set_error(new Error("请输入修改要求"));
        request_instruction_focus();
        return false;
      }

      const user_message = {
        id: next_message_id("user"),
        role: "user",
        streaming: false,
        text: instruction,
      };
      const agent_message = {
        id: next_message_id("agent"),
        role: "agent",
        streaming: true,
        text: "",
      };
      messages_.as(messages_.value.concat(user_message, agent_message));
      instruction_.as("");
      busy_.as(true);
      error_.as("");

      try {
        let session_id = session_id_.value;
        if (!session_id) {
          const session = await services.createMemoAgentSession({
            agentId: agent_id_.value || "opencode",
            mode: "memo-edit",
            selection: initial_candidate,
          });
          if (destroyed_) return false;
          session_id = String((session && session.sessionId) || "");
          session_id_.as(session_id);
        }

        const run = await services.createMemoAgentRun({
          instruction,
          sessionId: session_id,
        });
        if (destroyed_) return false;
        const run_id = String((run && run.runId) || "");
        if (!run_id) throw new Error("Agent 运行未返回 runId");
        active_run_id_.as(run_id);
        return await follow_run(run_id, agent_message.id);
      } catch (err) {
        if (destroyed_) return false;
        update_message(agent_message.id, { streaming: false });
        remove_empty_agent_message(agent_message.id);
        active_run_id_.as("");
        busy_.as(false);
        set_error(err);
        return false;
      }
    },
  };

  const model = defineModel({ state, methods });
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
