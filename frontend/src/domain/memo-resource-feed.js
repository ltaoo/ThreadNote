/**
 * Cursor-paginated feed over the vault memo resource index. Views render the
 * currently loaded items immediately and re-render when a page arrives, so
 * sidebar counts and list contents share one indexed source of truth.
 */
export function createMemoResourceFeed(fetch_page, options = {}) {
  let signature = null;
  let last_query = null;
  let loading = false;
  let request_seq = 0;
  const state = {
    hasMore: false,
    // "indexed" once the backend feed has answered; "local" keeps views on
    // the legacy in-page collectors when the native bridge is unavailable.
    mode: "local",
    nextCursor: "",
    ready: false,
    total: 0,
  };
  const items = [];
  const page_limit = Number(options.limit) || 100;
  const max_pages = Number(options.maxPages) || 10;

  function fetch_first(query, on_ready) {
    const seq = ++request_seq;
    loading = true;
    fetch_page({ ...query, limit: page_limit }).then(
      function (page) {
        loading = false;
        if (seq !== request_seq) return;
        items.length = 0;
        items.push(...page.items);
        state.hasMore = page.hasMore;
        state.nextCursor = page.nextCursor;
        state.total = page.total;
        state.mode = "indexed";
        state.ready = true;
        if (typeof on_ready === "function") on_ready();
      },
      function () {
        loading = false;
        if (seq !== request_seq) return;
        // Keep whatever is rendered; views fall back to local collection.
        if (typeof on_ready === "function") on_ready();
      },
    );
  }

  function fetch_next(on_ready) {
    const seq = request_seq;
    if (!state.ready || loading || !state.hasMore) return false;
    loading = true;
    fetch_page({
      ...last_query,
      cursor: state.nextCursor,
      limit: page_limit,
    }).then(
      function (page) {
        loading = false;
        if (seq !== request_seq) return;
        items.push(...page.items);
        state.hasMore = page.hasMore;
        state.nextCursor = page.nextCursor;
        state.total = page.total;
        if (typeof on_ready === "function") on_ready();
      },
      function () {
        loading = false;
      },
    );
    return true;
  }

  return {
    get hasMore() {
      return state.hasMore;
    },
    get items() {
      return items;
    },
    get loading() {
      return loading;
    },
    get mode() {
      return state.mode;
    },
    get ready() {
      return state.ready;
    },
    get total() {
      return state.total;
    },
    ensure(next_signature, query, on_ready) {
      if (next_signature === signature && (state.ready || loading)) {
        if (!loading && typeof on_ready === "function") on_ready();
        return;
      }
      signature = next_signature;
      last_query = query;
      request_seq += 1;
      loading = false;
      state.ready = false;
      state.hasMore = false;
      state.nextCursor = "";
      state.total = 0;
      fetch_first(query, on_ready);
    },
    loadMore(on_ready) {
      return fetch_next(on_ready);
    },
    // Keeps fetching pages until the vault is exhausted (bounded by
    // max_pages) so unpaginated grid views can show everything.
    loadAll(on_ready) {
      if (!state.ready || loading || !state.hasMore) {
        if (!loading && typeof on_ready === "function") on_ready();
        return;
      }
      if (items.length >= max_pages * page_limit) {
        if (typeof on_ready === "function") on_ready();
        return;
      }
      this.loadMore(() => this.loadAll(on_ready));
    },
    invalidate() {
      signature = null;
      last_query = null;
      request_seq += 1;
      loading = false;
      state.ready = false;
      state.hasMore = false;
      state.nextCursor = "";
      state.total = 0;
      items.length = 0;
    },
  };
}
