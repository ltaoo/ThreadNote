import {
  cancelMemoAgentRun,
  closeMemoAgent,
  createMemoAgentRun,
  createMemoAgentSession,
  loadMemoAgentRunEvents,
  loadMemoAgents,
} from "../../domain/memo-agent.js";
import { escapeHTML } from "./memo-utils.js";

const ACP_CHAT_DEBUG_KEY = "memo-agent-debug";
const ACP_CHAT_DEBUG_QUERY = "acp_debug";

function isACPChatDebugEnabled() {
  try {
    if (typeof window === "undefined") return false;
    if (window.location && window.location.search.indexOf(ACP_CHAT_DEBUG_QUERY + "=1") >= 0) return true;
    return typeof localStorage !== "undefined" && localStorage.getItem(ACP_CHAT_DEBUG_KEY) === "1";
  } catch (err) {
    return false;
  }
}

function acpChatDebug(label, payload) {
  if (!isACPChatDebugEnabled()) {
    return;
  }
  const ts = new Date().toISOString();
  console.info("[ACP Chat]", ts, label, payload || "");
}

export function mountACPChat(host) {
  let sessionId = "";
  let activeRunId = "";
  let busy = false;
  let destroyed = false;
  const messages = [];
  const mountStamp = new Date().toISOString();
  const debugContext = {
    mountId: "chat-" + mountStamp + "-" + Math.floor(Math.random() * 1000000),
    sessionId: "",
    runId: "",
    queryAt: mountStamp,
  };

  acpChatDebug("mountACPChat init", {
    mountId: debugContext.mountId,
    host: !!host,
  });

  host.innerHTML = chatTemplate();
  const els = {
    agent: host.querySelector("[data-acp-chat-agent]"),
    cancel: host.querySelector('[data-acp-chat-action="cancel"]'),
    error: host.querySelector("[data-acp-chat-error]"),
    input: host.querySelector("[data-acp-chat-input]"),
    messages: host.querySelector("[data-acp-chat-messages]"),
    send: host.querySelector('[data-acp-chat-action="send"]'),
    status: host.querySelector("[data-acp-chat-status]"),
  };

  host.addEventListener("click", handleClick);
  host.addEventListener("keydown", handleKeydown);
  loadMemoAgents().then(function (agents) {
    acpChatDebug("agents loaded", { mountId: debugContext.mountId, count: Array.isArray(agents) ? agents.length : 0 });
    return renderAgents(agents);
  }, function (err) {
    acpChatDebug("agents load failed", { mountId: debugContext.mountId, error: err && err.message ? err.message : String(err || "unknown") });
    showError(err);
    throw err;
  });

  function handleClick(event) {
    const action = event.target.closest("[data-acp-chat-action]");
    if (!action || !host.contains(action)) return;
    event.preventDefault();
    if (action.dataset.acpChatAction === "send") send();
    if (action.dataset.acpChatAction === "cancel") cancel();
    if (action.dataset.acpChatAction === "new") newConversation();
  }

  function handleKeydown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      send();
    }
  }

  function send() {
    if (busy || destroyed) return;
    const content = String(els.input.value || "").trim();
    if (!content) {
      showError(new Error("请输入消息"));
      els.input.focus();
      return;
    }
    const assistantMessage = { role: "assistant", text: "", streaming: true };
    messages.push({ role: "user", text: content }, assistantMessage);
    els.input.value = "";
    clearError();
    acpChatDebug("send clicked", {
      mountId: debugContext.mountId,
      hasSession: Boolean(sessionId),
      sessionId,
      instructionLength: content.length,
      busyBefore: busy,
      runInFlight: Boolean(activeRunId),
    });
    setBusy(true);
    renderMessages();

    const ensureSession = sessionId
      ? Promise.resolve({ sessionId })
      : createMemoAgentSession({
          agentId: String(els.agent.value || "opencode"),
          mode: "chat",
        });

    ensureSession.then(function (data) {
      if (destroyed) return null;
      const nextSessionId = String(data.sessionId || sessionId || "");
      if (!nextSessionId) {
        acpChatDebug("session create invalid result", { mountId: debugContext.mountId, raw: data });
      }
      sessionId = nextSessionId;
      debugContext.sessionId = sessionId;
      acpChatDebug("session ready", {
        mountId: debugContext.mountId,
        sessionId,
        agentId: data && data.agentId,
      });
      return createMemoAgentRun({ sessionId, instruction: content });
    }).then(function (data) {
      if (destroyed || !data) return;
      const nextRunId = String(data.runId || "");
      activeRunId = nextRunId;
      debugContext.runId = nextRunId;
      acpChatDebug("run created", {
        mountId: debugContext.mountId,
        sessionId,
        runId: nextRunId,
      });
      if (!nextRunId) {
        acpChatDebug("run create invalid result", { mountId: debugContext.mountId, raw: data });
      }
      return followRun(activeRunId, assistantMessage);
    }).catch(function (err) {
      if (destroyed) return;
      acpChatDebug("send failed", {
        mountId: debugContext.mountId,
        error: err && err.message ? err.message : String(err || "unknown"),
      });
      assistantMessage.streaming = false;
      assistantMessage.error = true;
      if (!assistantMessage.text) assistantMessage.text = "生成失败";
      setBusy(false);
      renderMessages();
      showError(err);
    });
  }

  function followRun(runId, assistantMessage) {
    let pollingRound = 0;
    let afterId = 0;
    let raw = "";
    let warningLogged = false;
    acpChatDebug("start followRun", { mountId: debugContext.mountId, runId });
    const startTime = Date.now();

    function poll() {
      if (destroyed || activeRunId !== runId) return Promise.resolve();
      pollingRound += 1;
      return loadMemoAgentRunEvents(runId, afterId).then(function (data) {
        const events = Array.isArray(data.events) ? data.events : [];
        acpChatDebug("poll result", {
          mountId: debugContext.mountId,
          runId,
          round: pollingRound,
          afterIdBefore: afterId,
          eventCount: events.length,
          done: !!data.done,
          elapsedMs: Date.now() - startTime,
        });
        const elapsedMs = Date.now() - startTime;
        if (!warningLogged && elapsedMs >= 60000 && !data.done) {
          warningLogged = true;
          acpChatDebug("run timeout warning", {
            mountId: debugContext.mountId,
            runId,
            elapsedMs,
            lastAfterId: afterId,
            lastEventCount: events.length,
          });
        }
        if (destroyed || activeRunId !== runId) return;
        events.forEach(function (event) {
          const safeId = Number(event && event.id || 0);
          acpChatDebug("event in", {
            mountId: debugContext.mountId,
            runId,
            eventId: safeId,
            eventType: event && event.type,
            hasData: event && event.data != null,
          });
          afterId = Math.max(afterId, Number(event.id || 0));
          const payload = event.data && typeof event.data === "object" ? event.data : {};
          if (event.type === "message.delta") {
            raw += String(payload.text || "");
            assistantMessage.text = raw;
            renderMessages();
          } else if (event.type === "status") {
            els.status.textContent = String(payload.text || payload.status || "Agent 正在思考…");
          } else if (event.type === "message.completed") {
            if (payload.content != null) {
              assistantMessage.text = String(payload.content);
            } else if (payload.message != null) {
              assistantMessage.text = String(payload.message);
            }
            renderMessages();
          } else if (event.type === "run.completed") {
            if (payload.stopReason === "cancelled") {
              assistantMessage.text = assistantMessage.text || "已取消";
            } else if (payload.content != null) {
              assistantMessage.text = String(payload.content);
            } else if (payload.message != null) {
              assistantMessage.text = String(payload.message);
            }
            acpChatDebug("run completed event", {
              mountId: debugContext.mountId,
              runId,
              stopReason: payload.stopReason,
              messageLen: String(assistantMessage.text || "").length,
              hasMessage: payload.message != null,
              hasContent: payload.content != null,
            });
            renderMessages();
          } else if (event.type === "run.failed") {
            acpChatDebug("run failed event", {
              mountId: debugContext.mountId,
              runId,
              error: payload.message,
            });
            throw new Error(payload.message || "ACP 对话失败");
          }
        });
        if (data.done) {
          assistantMessage.streaming = false;
          activeRunId = "";
          acpChatDebug("run done", {
            mountId: debugContext.mountId,
            runId,
            messageLen: String(assistantMessage.text || "").length,
            totalRounds: pollingRound,
          });
          setBusy(false);
          renderMessages();
          return;
        }
        return waitForEvents().then(poll);
      }).catch(function (err) {
        acpChatDebug("poll failed", {
          mountId: debugContext.mountId,
          runId,
          afterId,
          round: pollingRound,
          error: err && err.message ? err.message : String(err || "unknown"),
        });
        throw err;
      });
    }

    return poll();
  }

  function cancel() {
    if (!activeRunId) return;
    acpChatDebug("cancel called", { mountId: debugContext.mountId, runId: activeRunId });
    els.status.textContent = "正在取消…";
    cancelMemoAgentRun(activeRunId).catch(showError);
  }

  function newConversation() {
    if (busy) return;
    acpChatDebug("newConversation clicked", { mountId: debugContext.mountId, sessionId });
    const previous = sessionId;
    sessionId = "";
    messages.length = 0;
    clearError();
    renderMessages();
    setBusy(false);
    if (previous) closeMemoAgent(previous).catch(showError);
    els.input.focus();
  }

  function renderAgents(agents) {
    if (destroyed) return;
    const values = Array.isArray(agents) ? agents : [];
    els.agent.innerHTML = values.length ? values.map(function (agent) {
      return '<option value="' + escapeHTML(agent.id) + '">' + escapeHTML(agent.label || agent.id) + "</option>";
    }).join("") : '<option value="opencode">OpenCode</option>';
    if (Array.from(els.agent.options).some(function (option) { return option.value === "opencode"; })) {
      els.agent.value = "opencode";
    }
  }

  function renderMessages() {
    els.messages.innerHTML = messages.length ? messages.map(function (message) {
      const label = message.role === "user" ? "你" : "Agent";
      const classes = "acp-chat-message is-" + message.role + (message.error ? " is-error" : "");
      const cursor = message.streaming ? '<span class="acp-chat-cursor" aria-hidden="true"></span>' : "";
      return '<article class="' + classes + '"><div class="acp-chat-message-label">' + label + '</div><div class="acp-chat-message-content">' + escapeHTML(message.text || "正在连接 ACP Agent…") + cursor + "</div></article>";
    }).join("") : '<div class="acp-chat-empty"><strong>开始 ACP 对话</strong><span>消息会发送给本机已安装的原生 ACP Agent。</span></div>';
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function setBusy(value) {
    busy = Boolean(value);
    els.agent.disabled = busy || Boolean(sessionId);
    els.send.disabled = busy;
    els.cancel.hidden = !busy;
    els.status.textContent = busy ? "运行中" : (sessionId ? "对话已连接" : "尚未连接");
  }

  function showError(err) {
    if (destroyed) return;
    els.error.textContent = err && err.message ? err.message : String(err || "请求失败");
  }

  function clearError() {
    els.error.textContent = "";
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    acpChatDebug("destroy", { mountId: debugContext.mountId, sessionId, runId: activeRunId });
    host.removeEventListener("click", handleClick);
    host.removeEventListener("keydown", handleKeydown);
    if (activeRunId) cancelMemoAgentRun(activeRunId).catch(function () {});
    if (sessionId) closeMemoAgent(sessionId).catch(function () {});
    host.innerHTML = "";
  }

  renderMessages();
  setBusy(false);
  return { destroy };
}

function waitForEvents() {
  return new Promise(function (resolve) {
    window.setTimeout(resolve, 120);
  });
}

function chatTemplate() {
  return '<section class="acp-chat-page">'
    + '<header class="acp-chat-toolbar"><label><span>Agent</span><tn-select data-acp-chat-agent><option value="opencode">OpenCode</option></tn-select></label>'
    + '<div class="acp-chat-toolbar-actions"><span class="acp-chat-status" data-acp-chat-status></span><button class="tn-button tn-button--secondary memo-secondary-button" type="button" data-acp-chat-action="new">新建对话</button></div></header>'
    + '<div class="acp-chat-messages" data-acp-chat-messages aria-live="polite"></div>'
    + '<div class="acp-chat-error" data-acp-chat-error role="alert"></div>'
    + '<footer class="acp-chat-composer"><textarea rows="3" data-acp-chat-input placeholder="给 ACP Agent 发送消息…"></textarea>'
    + '<div class="acp-chat-composer-actions"><span>⌘/Ctrl + Enter 发送</span><button class="tn-button tn-button--secondary memo-secondary-button" type="button" data-acp-chat-action="cancel" hidden>取消</button><button class="tn-button tn-button--primary memo-primary-button" type="button" data-acp-chat-action="send">发送</button></div></footer>'
    + "</section>";
}
