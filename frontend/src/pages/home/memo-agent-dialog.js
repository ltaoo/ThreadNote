import {
  cancelMemoAgentRun,
  closeMemoAgent,
  createMemoAgentRun,
  createMemoAgentSession,
  loadMemoAgentRunEvents,
  loadMemoAgents,
} from "../../domain/memo-agent.js";
import { escapeHTML } from "./memo-utils.js";

let activeDialog = null;

export function openMemoAgentDialog(options) {
  if (activeDialog) activeDialog.destroy();
  activeDialog = createDialog(options || {});
  activeDialog.open();
  return activeDialog;
}

function createDialog(options) {
  let element = null;
  let sessionId = "";
  let activeRunId = "";
  let candidate = String(options.selection || "");
  let hasCandidate = candidate.length > 0;
  let busy = false;
  let destroyed = false;
  const messages = [];

  function open() {
    element = document.createElement("div");
    element.className = "memo-agent-dialog";
    element.innerHTML = dialogHTML(candidate);
    document.body.appendChild(element);
    element.addEventListener("click", handleClick);
    element.addEventListener("keydown", handleKeydown);
    render();
    loadMemoAgents().then(renderAgents, showError);
    const input = element.querySelector("[data-memo-agent-input]");
    if (input) input.focus();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (activeRunId) cancelMemoAgentRun(activeRunId).catch(function () {});
    if (sessionId) closeMemoAgent(sessionId).catch(function () {});
    if (element) {
      element.removeEventListener("click", handleClick);
      element.removeEventListener("keydown", handleKeydown);
      element.remove();
    }
    element = null;
    if (activeDialog && activeDialog.destroy === destroy) activeDialog = null;
  }

  function handleClick(event) {
    const action = event.target.closest("[data-memo-agent-action]");
    if (!action || !element.contains(action)) {
      if (event.target === element && !busy) destroy();
      return;
    }
    event.preventDefault();
    switch (action.dataset.memoAgentAction) {
      case "close":
        destroy();
        break;
      case "send":
        send();
        break;
      case "apply":
        if (hasCandidate && typeof options.replace === "function" && options.replace(candidate) !== false) {
          destroy();
        } else {
          showError(new Error("原选区已经变化，请重新选择内容"));
        }
        break;
    }
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      destroy();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      send();
    }
  }

  function send() {
    if (busy || !element) return;
    const input = element.querySelector("[data-memo-agent-input]");
    const instruction = String((input && input.value) || "").trim();
    if (!instruction) {
      showError(new Error("请输入修改要求"));
      if (input) input.focus();
      return;
    }
    const agentSelect = element.querySelector("[data-memo-agent-select]");
    const agentId = String((agentSelect && agentSelect.value) || "opencode");
    const agentMessage = { role: "agent", text: "", streaming: true };
    messages.push({ role: "user", text: instruction }, agentMessage);
    if (input) input.value = "";
    setBusy(true);
    clearError();
    renderMessages();

    const ensureSession = sessionId
      ? Promise.resolve({ sessionId })
      : createMemoAgentSession({ agentId, mode: "memo-edit", selection: options.selection || "" });

    ensureSession.then(function (data) {
      if (destroyed) return;
      sessionId = String(data.sessionId || sessionId);
      return createMemoAgentRun({ sessionId, instruction });
    }).then(function (data) {
      if (destroyed || !data) return;
      activeRunId = String(data.runId || "");
      return followRun(activeRunId, agentMessage);
    }).catch(function (err) {
      if (destroyed) return;
      agentMessage.streaming = false;
      if (!agentMessage.text) messages.pop();
      showError(err);
      setBusy(false);
    });
  }

  function followRun(runId, agentMessage) {
    let afterId = 0;
    let raw = "";

    function poll() {
      if (destroyed || activeRunId !== runId) return Promise.resolve();
      return loadMemoAgentRunEvents(runId, afterId).then(function (data) {
        if (destroyed || activeRunId !== runId) return;
        const events = Array.isArray(data.events) ? data.events : [];
        events.forEach(function (event) {
          afterId = Math.max(afterId, Number(event.id || 0));
          const payload = event.data && typeof event.data === "object" ? event.data : {};
          if (event.type === "message.delta") {
            raw += String(payload.text || "");
            agentMessage.text = memoAgentStreamText(raw) || "正在生成…";
            renderMessages();
          } else if (event.type === "run.completed") {
            if (payload.stopReason !== "cancelled" && payload.replacement != null) {
              candidate = String(payload.replacement);
              hasCandidate = true;
              agentMessage.text = candidate;
            }
          } else if (event.type === "run.failed") {
            throw new Error(payload.message || "Agent 对话失败");
          }
        });
        if (data.done) {
          agentMessage.streaming = false;
          activeRunId = "";
          render();
          setBusy(false);
          return;
        }
        return waitForMemoAgentEvents().then(poll);
      });
    }

    return poll();
  }

  function renderAgents(agents) {
    if (destroyed || !element) return;
    const select = element.querySelector("[data-memo-agent-select]");
    if (!select) return;
    select.innerHTML = agents.map(function (agent) {
      return '<option value="' + escapeHTML(agent.id) + '">' + escapeHTML(agent.label || agent.id) + "</option>";
    }).join("");
    if (Array.from(select.options).some(function (option) { return option.value === "opencode"; })) {
      select.value = "opencode";
    }
  }

  function render() {
    if (!element) return;
    const preview = element.querySelector("[data-memo-agent-preview]");
    if (preview) preview.textContent = candidate;
    const apply = element.querySelector('[data-memo-agent-action="apply"]');
    if (apply) apply.disabled = busy || !hasCandidate;
    renderMessages();
  }

  function renderMessages() {
    if (!element) return;
    const host = element.querySelector("[data-memo-agent-messages]");
    if (!host) return;
    host.innerHTML = messages.length ? messages.map(function (message) {
      const label = message.role === "agent" ? "Agent" : "你";
      return '<div class="memo-agent-message is-' + message.role + '"><strong>' + label + '</strong><div>' + escapeHTML(message.text) + "</div></div>";
    }).join("") : '<div class="memo-agent-empty">描述你希望如何修改这段内容。</div>';
    host.scrollTop = host.scrollHeight;
  }

  function setBusy(value) {
    busy = Boolean(value);
    if (!element) return;
    element.classList.toggle("is-busy", busy);
    element.querySelectorAll("button, select, textarea").forEach(function (control) {
      control.disabled = busy;
    });
    const closeButton = element.querySelector('[data-memo-agent-action="close"]');
    if (closeButton) closeButton.disabled = false;
    const sendButton = element.querySelector('[data-memo-agent-action="send"]');
    if (sendButton) sendButton.textContent = busy ? "处理中…" : "发送";
  }

  function showError(err) {
    if (!element) return;
    const host = element.querySelector("[data-memo-agent-error]");
    if (host) host.textContent = err && err.message ? err.message : String(err || "请求失败");
  }

  function clearError() {
    const host = element && element.querySelector("[data-memo-agent-error]");
    if (host) host.textContent = "";
  }

  return { destroy, open };
}

function waitForMemoAgentEvents() {
  return new Promise(function (resolve) {
    window.setTimeout(resolve, 120);
  });
}

function memoAgentStreamText(value) {
  const startMarker = "<<<VELO_REPLACEMENT>>>";
  const endMarker = "<<<VELO_REPLACEMENT_END>>>";
  let text = String(value || "");
  const start = text.lastIndexOf(startMarker);
  if (start >= 0) text = text.slice(start + startMarker.length).replace(/^\r?\n/, "");
  const end = text.indexOf(endMarker);
  if (end >= 0) text = text.slice(0, end);
  return text;
}

function dialogHTML(selection) {
  return '<section class="memo-agent-panel" role="dialog" aria-modal="true" aria-labelledby="memo-agent-title">'
    + '<header class="memo-agent-head"><div><h2 id="memo-agent-title">对话编辑</h2><p>Agent 会重写当前选区，确认后再替换到编辑器。</p></div>'
    + '<button type="button" data-memo-agent-action="close" aria-label="关闭">×</button></header>'
    + '<div class="memo-agent-body">'
    + '<label class="memo-agent-field"><span>Agent</span><select data-memo-agent-select><option value="opencode">OpenCode</option></select></label>'
    + '<div class="memo-agent-section"><span>当前替换内容</span><pre data-memo-agent-preview>' + escapeHTML(selection) + '</pre></div>'
    + '<div class="memo-agent-messages" data-memo-agent-messages></div>'
    + '<label class="memo-agent-field"><span>修改要求</span><textarea rows="3" data-memo-agent-input placeholder="例如：改得更简洁，并保留 Markdown 格式"></textarea></label>'
    + '<div class="memo-agent-error" data-memo-agent-error></div></div>'
    + '<footer class="memo-agent-actions"><span>⌘/Ctrl + Enter 发送</span><div><button type="button" data-memo-agent-action="send">发送</button>'
    + '<button class="is-primary" type="button" data-memo-agent-action="apply">替换选区</button></div></footer></section>';
}
