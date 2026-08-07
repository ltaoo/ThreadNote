export function canUseNativeBridge() {
  return typeof globalThis.invoke === "function";
}

function isNativeDebugEnabled() {
  try {
    if (typeof window === "undefined") return false;
    if (window.location && window.location.search.indexOf("acp_debug=1") >= 0) return true;
    return typeof localStorage !== "undefined" && localStorage.getItem("memo-agent-debug") === "1";
  } catch (_) {
    return false;
  }
}

function nativeDebug(label, payload) {
  if (!isNativeDebugEnabled()) return;
  console.info("[native]", new Date().toISOString(), label, payload || "");
}

export function callNativeAPI(url, options) {
  if (!canUseNativeBridge()) {
    nativeDebug("callNativeAPI fallback to HTTP", { url: url });
    return callNativeAPIWithHTTP(url, options);
  }
  nativeDebug("callNativeAPI via bridge", { url: url, method: (options && options.method) || "GET" });
  return globalThis.invoke(url, options || {}).then(function (resp) {
    if (!resp || resp.code !== 0) {
      throw new Error((resp && resp.msg) || "request failed");
    }
    return resp.data || {};
  });
}

function callNativeAPIWithHTTP(url, options) {
  var opts = options || {};
  var method = String(opts.method || "GET").toUpperCase();
  var args = opts.args || {};
  var headers = opts.headers || {};
  var fetchUrl = url;
  var query = {};
  var requestHeaders = {
    "Content-Type": "application/json",
  };
  Object.keys(headers).forEach(function (name) {
    requestHeaders[name] = headers[name];
  });

  if (method === "GET" && args && typeof args === "object" && Object.keys(args).length > 0) {
    query = Object.keys(args).reduce(function (acc, key) {
      acc[key] = typeof args[key] === "string" ? args[key] : JSON.stringify(args[key]);
      return acc;
    }, query);
  }

  if (Object.keys(query).length > 0) {
    var qs = new URLSearchParams(query).toString();
    fetchUrl = fetchUrl + (fetchUrl.indexOf("?") >= 0 ? "&" : "?") + qs;
  }

  var init = {
    method: method,
    headers: requestHeaders,
    credentials: "same-origin",
    mode: "same-origin",
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = JSON.stringify(args || {});
  }

  if (typeof fetch !== "function") {
    return Promise.reject(new Error("fetch not available"));
  }
  return fetch(fetchUrl, init).then(function (resp) {
    if (!resp) {
      throw new Error("empty fetch response");
    }
    return resp.text().then(function (text) {
      try {
        return JSON.parse(text);
      } catch (parseErr) {
        throw new Error((resp && resp.statusText ? resp.statusText : "response parse failed") + ": " + text.slice(0, 200));
      }
    }).then(function (payload) {
      if (!payload) {
        throw new Error("empty response");
      }
      if (payload.code === undefined) {
        return payload;
      }
      if (payload.code !== 0) {
        throw new Error(payload.msg || "request failed");
      }
      return payload.data || {};
    });
  });
}

export function errorText(err) {
  return err && err.message ? err.message : String(err || "unknown error");
}
