export const DEFAULT_MAX_RESULTS = 18;
export const DEFAULT_SEARCH_DEBOUNCE_MS = 80;

export function parseLauncherQuery(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const match = raw.match(/^(snippet|snip|link|links|url|链接)(?:\s+(.*))?$/i);
  if (match) {
    const name = match[1].toLowerCase();
    const term = String(match[2] || "").trim();
    if (name === "link" || name === "links" || name === "url" || name === "链接") {
      return {
        emptyLabel: "link",
        requests: [searchRequest("/api/links/search", "link", term)],
        scope: "link",
        term,
      };
    }
    return {
      emptyLabel: "snippet",
      requests: [searchRequest("/api/snippets/search", "snippet", term)],
      scope: "snippet",
      term,
    };
  }

  return {
    emptyLabel: "snippet 或 link",
    requests: [
      searchRequest("/api/snippets/search", "snippet", raw),
      searchRequest("/api/links/search", "link", raw),
    ],
    scope: "all",
    term: raw,
  };
}

export function launcherCommandSuggestion(value) {
  const raw = String(value || "");
  if (!raw || raw.trim() !== raw || /\s/.test(raw)) return null;

  const normalized = raw.toLowerCase();
  const command = ["snippet", "link"].find(function (item) {
    return item.startsWith(normalized) && item !== normalized;
  });
  if (!command) return null;

  return {
    command,
    prefix: raw,
    suffix: command.slice(raw.length),
  };
}

export function mergeSearchItemGroups(groups, limit) {
  const queues = (Array.isArray(groups) ? groups : [])
    .map(function (group) {
      return Array.isArray(group) ? group : [];
    })
    .filter(function (group) {
      return group.length > 0;
    });
  const maxResults = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_MAX_RESULTS;
  const items = [];

  for (let index = 0; items.length < maxResults; index += 1) {
    let appended = false;
    for (const queue of queues) {
      if (index >= queue.length) continue;
      items.push(queue[index]);
      appended = true;
      if (items.length >= maxResults) break;
    }
    if (!appended) break;
  }

  return items;
}

export class SnippetLauncherModel {
  constructor(services, options) {
    const config = options || {};
    this.services = services || {};
    this.maxResults = config.maxResults || DEFAULT_MAX_RESULTS;
    this.searchDebounceMs = config.searchDebounceMs ?? DEFAULT_SEARCH_DEBOUNCE_MS;
    this.listeners = [];
    this.searchTimer = null;
    this.actionTimer = null;
    this.state = {
      activeIndex: 0,
      closing: false,
      items: [],
      loading: false,
      query: "",
      requestId: 0,
      status: "",
    };
  }

  start() {
    if (typeof this.services.keepWindowOnTop === "function") {
      this.services.keepWindowOnTop();
    }
    this.notify();
  }

  subscribe(listener) {
    if (typeof listener !== "function") return function () {};
    this.listeners.push(listener);
    listener(this.snapshot());
    return () => {
      this.listeners = this.listeners.filter(function (item) {
        return item !== listener;
      });
    };
  }

  snapshot() {
    return {
      activeIndex: this.state.activeIndex,
      command: parseLauncherQuery(this.state.query),
      commandSuggestion: launcherCommandSuggestion(this.state.query),
      items: this.state.items.slice(),
      loading: this.state.loading,
      query: this.state.query,
      status: this.state.status,
    };
  }

  setQuery(value) {
    this.state.query = String(value || "");
    this.state.status = "";
    if (!parseLauncherQuery(this.state.query)) {
      this.cancelSearchTimer();
      this.state.requestId += 1;
      this.state.activeIndex = 0;
      this.state.items = [];
      this.state.loading = false;
      this.notify();
      return;
    }

    this.state.loading = true;
    this.notify();
    this.scheduleSearch();
  }

  scheduleSearch() {
    this.cancelSearchTimer();
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      this.searchNow();
    }, this.searchDebounceMs);
  }

  async searchNow() {
    this.cancelSearchTimer();
    const command = parseLauncherQuery(this.state.query);
    if (!command) return [];

    const requestId = ++this.state.requestId;
    this.state.loading = true;
    this.state.status = "";
    this.notify();

    try {
      if (typeof this.services.request !== "function") {
        throw new Error("当前环境不可用");
      }
      const groups = await Promise.all(command.requests.map((request) => {
        const url = request.endpoint + "?q=" + encodeURIComponent(request.query) + "&limit=" + this.maxResults;
        return this.services.request(url, { method: "GET" }).then(function (response) {
          if (!response || response.code !== 0) {
            throw new Error((response && response.msg) || "搜索失败");
          }
          const data = response.data || {};
          return Array.isArray(data.items) ? data.items : [];
        });
      }));

      if (requestId !== this.state.requestId) return [];
      this.state.items = mergeSearchItemGroups(groups, this.maxResults);
      this.state.activeIndex = Math.max(0, Math.min(this.state.activeIndex, this.state.items.length - 1));
      this.state.loading = false;
      this.state.status = "";
      this.notify();
      return this.state.items.slice();
    } catch (error) {
      if (requestId !== this.state.requestId) return [];
      this.state.items = [];
      this.state.activeIndex = 0;
      this.state.loading = false;
      this.state.status = errorMessage(error);
      this.notify();
      return [];
    }
  }

  setActiveIndex(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.state.items.length) return;
    if (index === this.state.activeIndex) return;
    this.state.activeIndex = index;
    this.notify();
  }

  moveActive(delta) {
    if (!this.state.items.length) return;
    this.state.activeIndex = (this.state.activeIndex + delta + this.state.items.length) % this.state.items.length;
    this.notify();
  }

  acceptCommandSuggestion() {
    const suggestion = launcherCommandSuggestion(this.state.query);
    if (!suggestion) return false;
    this.setQuery(suggestion.command);
    return true;
  }

  async activateActiveItem(copyOnly) {
    const item = this.state.items[this.state.activeIndex];
    if (!item) return;

    if (item.url) {
      if (copyOnly) {
        await this.copyItem(item.url, item.label || item.url);
      } else {
        await this.openLink(item);
      }
      return;
    }
    await this.copyItem(item.code || "", item.command || item.title || "代码块");
  }

  async openLink(item) {
    try {
      if (typeof this.services.openLink !== "function") throw new Error("当前环境不可用");
      await this.services.openLink(item.url);
      this.state.status = "已打开 " + (item.label || item.url);
      this.notify();
      this.closeAfter(120);
    } catch (error) {
      this.state.status = "打开失败: " + errorMessage(error);
      this.notify();
    }
  }

  async copyItem(value, label) {
    try {
      if (typeof this.services.copyText !== "function") throw new Error("当前环境不可用");
      await this.services.copyText(value);
      this.state.status = "已复制 " + label;
      this.notify();
      this.closeAfter(160);
    } catch (error) {
      this.state.status = "复制失败: " + errorMessage(error);
      this.notify();
    }
  }

  closeAfter(delay) {
    this.cancelActionTimer();
    this.actionTimer = setTimeout(() => {
      this.actionTimer = null;
      this.close();
    }, delay);
  }

  close() {
    if (this.state.closing) return;
    this.state.closing = true;
    this.resetSearchState();
    if (typeof this.services.hideWindow === "function") {
      this.services.hideWindow();
    }
  }

  hide() {
    if (this.state.closing) return;
    this.resetSearchState();
    if (typeof this.services.hideWindow === "function") {
      this.services.hideWindow();
    }
  }

  handleFocus() {
    this.state.closing = false;
  }

  resetSearchState() {
    this.cancelSearchTimer();
    this.cancelActionTimer();
    this.state.requestId += 1;
    this.state.activeIndex = 0;
    this.state.items = [];
    this.state.loading = false;
    this.state.query = "";
    this.state.status = "";
    this.notify();
  }

  cancelSearchTimer() {
    if (!this.searchTimer) return;
    clearTimeout(this.searchTimer);
    this.searchTimer = null;
  }

  cancelActionTimer() {
    if (!this.actionTimer) return;
    clearTimeout(this.actionTimer);
    this.actionTimer = null;
  }

  notify() {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  destroy() {
    this.cancelSearchTimer();
    this.cancelActionTimer();
    this.listeners = [];
  }
}

function searchRequest(endpoint, prefix, term) {
  return {
    endpoint,
    query: term ? prefix + " " + term : prefix,
  };
}

function errorMessage(error) {
  return error && error.message ? error.message : String(error || "unknown error");
}
