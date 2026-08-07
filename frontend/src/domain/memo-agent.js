import { callNativeAPI } from "./native.js";

function isMemoAgentDebugEnabled() {
  try {
    return (
      (typeof window !== "undefined" && !!window.location && window.location.search.indexOf("acp_debug=1") >= 0) ||
      (typeof localStorage !== "undefined" && localStorage.getItem("memo-agent-debug") === "1")
    );
  } catch (err) {
    return false;
  }
}

function memoAgentDebugLog(label, payload) {
  if (!isMemoAgentDebugEnabled()) {
    return;
  }
  const ts = new Date().toISOString();
  console.info("[memo-agent]", ts, label, payload || "");
}

function compactText(value, limit) {
  const text = String(value);
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "...( " + (text.length - limit) + " chars)";
}

export function loadMemoAgents() {
  memoAgentDebugLog("loadMemoAgents request", { url: "/api/memo-agent/providers" });
  return callNativeAPI("/api/memo-agent/providers", { method: "GET" }).then(function (data) {
    memoAgentDebugLog("loadMemoAgents ok", { count: Array.isArray(data && data.agents) ? data.agents.length : 0 });
    return Array.isArray(data.agents) ? data.agents : [];
  }).catch(function (err) {
    memoAgentDebugLog("loadMemoAgents failed", { error: err && err.message ? err.message : String(err || "unknown") });
    throw err;
  });
}

export function createMemoAgentSession(input) {
  memoAgentDebugLog("createMemoAgentSession request", { input: input || {} });
  return callNativeAPI("/api/memo-agent/sessions/create", {
    method: "POST",
    args: input || {},
  }).then(function (data) {
    memoAgentDebugLog("createMemoAgentSession ok", { sessionId: data && data.sessionId, agentId: data && data.agentId });
    return data;
  }).catch(function (err) {
    memoAgentDebugLog("createMemoAgentSession failed", { error: err && err.message ? err.message : String(err || "unknown"), input });
    throw err;
  });
}

export function createMemoAgentRun(input) {
  memoAgentDebugLog("createMemoAgentRun request", { input: input || {} });
  return callNativeAPI("/api/memo-agent/runs/create", {
    method: "POST",
    args: input || {},
  }).then(function (data) {
    memoAgentDebugLog("createMemoAgentRun ok", { runId: data && data.runId, sessionId: data && data.sessionId });
    return data;
  }).catch(function (err) {
    memoAgentDebugLog("createMemoAgentRun failed", { error: err && err.message ? err.message : String(err || "unknown"), input });
    throw err;
  });
}

export function loadMemoAgentRunEvents(runId, afterId) {
  const query = "?runId=" + encodeURIComponent(runId || "") + "&afterId=" + encodeURIComponent(afterId || 0);
  memoAgentDebugLog("loadMemoAgentRunEvents request", { runId, afterId, query });
  return callNativeAPI("/api/memo-agent/runs/events" + query, { method: "GET" }).then(function (data) {
    const events = Array.isArray(data && data.events) ? data.events : [];
    memoAgentDebugLog("loadMemoAgentRunEvents ok", {
      runId,
      afterId,
      eventCount: events.length,
      done: !!(data && data.done),
      sampleEvent: events.length ? compactText(JSON.stringify(events[0]), 280) : null,
    });
    return data;
  }).catch(function (err) {
    memoAgentDebugLog("loadMemoAgentRunEvents failed", { runId, afterId, error: err && err.message ? err.message : String(err || "unknown") });
    throw err;
  });
}

export function cancelMemoAgentRun(runId) {
  if (!runId) return Promise.resolve();
  memoAgentDebugLog("cancelMemoAgentRun request", { runId });
  return callNativeAPI("/api/memo-agent/runs/cancel", {
    method: "POST",
    args: { runId },
  }).then(function (data) {
    memoAgentDebugLog("cancelMemoAgentRun ok", { runId, data: data || null });
    return data;
  }).catch(function (err) {
    memoAgentDebugLog("cancelMemoAgentRun failed", { runId, error: err && err.message ? err.message : String(err || "unknown") });
    throw err;
  });
}

export function closeMemoAgent(sessionId) {
  if (!sessionId) return Promise.resolve();
  memoAgentDebugLog("closeMemoAgent request", { sessionId });
  return callNativeAPI("/api/memo-agent/sessions/close", {
    method: "POST",
    args: { sessionId },
  }).then(function (data) {
    memoAgentDebugLog("closeMemoAgent ok", { sessionId, data: data || null });
    return data;
  }).catch(function (err) {
    memoAgentDebugLog("closeMemoAgent failed", { sessionId, error: err && err.message ? err.message : String(err || "unknown") });
    throw err;
  });
}
