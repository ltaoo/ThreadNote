import { Timeless, TimelessPrimitive } from "@/timeless-icons.js";
import { logMemoPagination } from "@/domain/memo-pagination-log.js";

import { MemoCardView } from "./home_memo.components.js";
import { MemoVirtualListModel } from "./memo-virtual-list.model.js";

function destroy_view(mounted) {
  if (!mounted || mounted.destroyed) return;
  mounted.destroyed = true;
  mounted.view.beforeUnmounted?.();
  mounted.nodes.forEach((node) => node.remove?.());
  mounted.view.onUnmounted?.();
  mounted.vnode?.destroy?.();
}

export function mountMemoVirtualList(host, props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, View } = runtime;
  const model = new MemoVirtualListModel();
  const mounted_rows = new Map();
  const previous_host_style = {
    height: host.style.height,
    position: host.style.position,
  };
  let destroyed = false;
  let empty_view = null;
  let footer_view = null;
  let frame = 0;
  let notify_pending = false;
  let pending_target = null;
  let scroll_host = null;
  let previous_overflow_anchor = "";
  let raw_viewport_top = 0;
  let measured_width = 0;

  function values() {
    return Array.isArray(props.memos?.value)
      ? props.memos.value
      : Array.isArray(props.memos)
        ? props.memos
        : [];
  }

  function projects() {
    return Array.isArray(props.projects?.value)
      ? props.projects.value
      : Array.isArray(props.projects)
        ? props.projects
        : [];
  }

  function has_more() {
    return Boolean(props.hasMore?.value ?? props.hasMore);
  }

  function mount_view(view, before = null) {
    const rendered = runtime.DOM.buildAndRender(view);
    const nodes =
      rendered.dom.nodeType === Node.DOCUMENT_FRAGMENT_NODE
        ? Array.from(rendered.dom.childNodes)
        : [rendered.dom];
    const mounted = {
      destroyed: false,
      dom: nodes.find((node) => node.nodeType === Node.ELEMENT_NODE),
      nodes,
      view,
      vnode: rendered.vnode,
    };
    host.insertBefore(rendered.dom, before);
    if (!mounted.dom) throw new Error("Memo virtual row requires one element");
    globalThis.queueMicrotask(function () {
      if (!mounted.destroyed) view.onMounted?.({ target: rendered.vnode });
    });
    return mounted;
  }

  function empty_state_view() {
    return View(
      {
        class: "memo-empty-state",
        attributes: { n: "memo-feed-empty" },
      },
      [
        View(
          {
            class: "memo-empty-icon",
            attributes: { n: "memo-feed-empty-icon" },
          },
          [
            Timeless.Icon({
              name: "search",
              attributes: { n: "memo-feed-empty-symbol" },
            }),
          ],
        ),
        View(
          { as: "h2", attributes: { n: "memo-feed-empty-title" } },
          ["没有匹配的 memo"],
        ),
        Button(
          {
            class: "tn-button tn-button--secondary memo-secondary-button",
            attributes: {
              "data-action": "clearFilters",
              n: "memo-feed-clear-filters",
              type: "button",
            },
          },
          ["查看全部"],
        ),
      ],
    );
  }

  function load_more_view() {
    const label_ = computed(props.loading, function (loading) {
      return loading ? "正在加载..." : "加载更多...";
    });
    return View(
      {
        class: "memo-feed-load-more",
        attributes: { n: "memo-feed-load-more" },
        onMounted(event) {
          props.onLoadMoreSentinelMounted?.(event);
        },
        onUnmounted() {
          props.onLoadMoreSentinelUnmounted?.();
        },
      },
      [
        Button(
          {
            class: "tn-button tn-button--ghost",
            disabled: props.loading,
            onClick() {
              logMemoPagination("info", "load-more-button-clicked");
              props.onLoadMore?.("button");
            },
            attributes: {
              n: "memo-feed-load-more-action",
              type: "button",
            },
          },
          [label_],
        ),
      ],
    );
  }

  function sync_scroll_host() {
    const next_scroll_host =
      props.scrollElement?.() ||
      host.closest?.('[data-n="home-memo-main"]') ||
      host.parentElement;
    if (next_scroll_host === scroll_host) return;
    if (scroll_host) {
      scroll_host.removeEventListener("scroll", schedule_render);
      scroll_host.style.overflowAnchor = previous_overflow_anchor;
      resize_observer?.unobserve(scroll_host);
    }
    scroll_host = next_scroll_host;
    if (!scroll_host) return;
    previous_overflow_anchor = scroll_host.style.overflowAnchor;
    scroll_host.style.overflowAnchor = "none";
    scroll_host.addEventListener("scroll", schedule_render, { passive: true });
    resize_observer?.observe(scroll_host);
  }

  function update_viewport() {
    sync_scroll_host();
    const host_rect = host.getBoundingClientRect();
    const scroll_rect = scroll_host?.getBoundingClientRect?.() || {
      height: globalThis.innerHeight || 0,
      top: 0,
    };
    raw_viewport_top = scroll_rect.top - host_rect.top;
    model.setViewport(
      Math.max(0, raw_viewport_top),
      scroll_host?.clientHeight || scroll_rect.height || 0,
    );
  }

  function keep_keys() {
    return typeof props.keepKeys === "function" ? props.keepKeys() : [];
  }

  function mount_row(index) {
    const item = model.items[index];
    const key = model.keys[index];
    const next_entry = Array.from(mounted_rows.values())
      .filter((entry) => entry.index > index)
      .sort((left, right) => left.index - right.index)[0];
    const view = MemoCardView({ memo: item, projects: projects(), runtime });
    const mounted = mount_view(view, next_entry?.dom || footer_view?.dom || null);
    mounted.dom.style.insetInline = "0";
    mounted.dom.style.position = "absolute";
    mounted.index = index;
    mounted.item = item;
    mounted.key = key;
    mounted_rows.set(key, mounted);
    row_observer?.observe(mounted.dom);
    return mounted;
  }

  function destroy_row(entry) {
    row_observer?.unobserve(entry.dom);
    mounted_rows.delete(entry.key);
    destroy_view(entry);
  }

  function position_rows() {
    mounted_rows.forEach(function (entry) {
      const index = model.indexForKey(entry.key);
      if (index === undefined) {
        destroy_row(entry);
        return;
      }
      entry.index = index;
      entry.dom.style.top = `${model.offsetAt(index)}px`;
    });
    host.style.height = `${Math.max(1, model.total_height)}px`;
    if (footer_view) {
      footer_view.dom.style.insetInline = "0";
      footer_view.dom.style.position = "absolute";
      footer_view.dom.style.top = `${model.items_end + 12}px`;
    }
  }

  function measure_rows() {
    let scroll_delta = 0;
    const previous_total = model.total_height;
    Array.from(mounted_rows.values())
      .sort((left, right) => left.index - right.index)
      .forEach(function (entry) {
        const delta = model.measure(
          entry.key,
          entry.dom.getBoundingClientRect().height,
        );
        scroll_delta += delta;
        if (delta) {
          model.setViewport(
            model.viewport_top + delta,
            model.viewport_height,
          );
        }
      });
    if (scroll_delta && scroll_host) scroll_host.scrollTop += scroll_delta;
    if (previous_total !== model.total_height || scroll_delta) position_rows();
    return previous_total !== model.total_height;
  }

  function sync_footer() {
    if (!has_more()) {
      destroy_view(footer_view);
      footer_view = null;
      return;
    }
    if (!footer_view) footer_view = mount_view(load_more_view());
  }

  function sync_rows(remount = false) {
    const desired_indexes = model.renderIndexes();
    const desired_keys = new Set(desired_indexes.map((index) => model.keys[index]));
    mounted_rows.forEach(function (entry, key) {
      if (remount || !desired_keys.has(key)) destroy_row(entry);
    });
    desired_indexes.forEach(function (index) {
      const key = model.keys[index];
      const entry = mounted_rows.get(key);
      if (!entry || entry.item !== model.items[index]) mount_row(index);
    });
    position_rows();
  }

  function notify_rows_rendered() {
    if (notify_pending) return;
    notify_pending = true;
    globalThis.queueMicrotask(function () {
      notify_pending = false;
      if (!destroyed) props.onRowsRendered?.();
    });
  }

  function reveal_pending_target() {
    if (!pending_target) return;
    const entry = mounted_rows.get(pending_target.key);
    if (!entry) return;
    const target = pending_target.selector
      ? entry.dom.querySelector(pending_target.selector)
      : entry.dom;
    if (!target) return;
    target.scrollIntoView({
      behavior: pending_target.behavior,
      block: "center",
    });
    pending_target = null;
  }

  function render_visible_rows() {
    if (destroyed) return;
    frame = 0;
    update_viewport();
    model.setPinnedKeys(keep_keys());
    sync_rows(false);
    if (measure_rows()) sync_rows(false);
    reveal_pending_target();
    notify_rows_rendered();
  }

  function schedule_render() {
    if (destroyed || frame) return;
    frame = globalThis.requestAnimationFrame(render_visible_rows);
  }

  const row_observer =
    typeof globalThis.ResizeObserver === "function"
      ? new globalThis.ResizeObserver(function (entries) {
        if (destroyed) return;
        let changed = false;
        let scroll_delta = 0;
        entries.forEach(function (resize_entry) {
          const entry = Array.from(mounted_rows.values()).find(
            (candidate) => candidate.dom === resize_entry.target,
          );
          if (!entry) return;
          const previous_total = model.total_height;
          const delta = model.measure(
            entry.key,
            resize_entry.target.getBoundingClientRect().height,
          );
          changed ||= previous_total !== model.total_height;
          scroll_delta += delta;
          if (delta) {
            model.setViewport(
              model.viewport_top + delta,
              model.viewport_height,
            );
          }
        });
        if (scroll_delta && scroll_host) scroll_host.scrollTop += scroll_delta;
        if (changed) position_rows();
        schedule_render();
      })
      : null;

  const resize_observer =
    typeof globalThis.ResizeObserver === "function"
      ? new globalThis.ResizeObserver(function () {
        const next_width = Math.round(host.getBoundingClientRect().width);
        if (!next_width || next_width === measured_width) return;
        measured_width = next_width;
        model.invalidateMeasurements(Array.from(mounted_rows.keys()));
        measure_rows();
        schedule_render();
      })
      : null;

  host.setAttribute("data-virtual-list", "true");
  host.style.position = "relative";
  measured_width = Math.round(host.getBoundingClientRect().width);
  resize_observer?.observe(host);

  const controller = {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame) globalThis.cancelAnimationFrame(frame);
      row_observer?.disconnect();
      resize_observer?.disconnect();
      if (scroll_host) {
        scroll_host.removeEventListener("scroll", schedule_render);
        scroll_host.style.overflowAnchor = previous_overflow_anchor;
      }
      mounted_rows.forEach(destroy_view);
      mounted_rows.clear();
      destroy_view(empty_view);
      destroy_view(footer_view);
      host.removeAttribute("data-virtual-list");
      host.style.height = previous_host_style.height;
      host.style.position = previous_host_style.position;
    },
    refresh(options = {}) {
      if (destroyed) return;
      model.setItems(values());
      model.setBottomPadding(has_more() ? 76 : 24);
      model.setPinnedKeys(keep_keys());
      update_viewport();
      if (!model.items.length) {
        mounted_rows.forEach(destroy_row);
        sync_footer();
        if (!empty_view) {
          empty_view = mount_view(empty_state_view(), footer_view?.dom || null);
        }
        host.style.height = has_more() ? "356px" : "280px";
        if (footer_view) {
          footer_view.dom.style.insetInline = "0";
          footer_view.dom.style.position = "absolute";
          footer_view.dom.style.top = "292px";
        }
        return;
      }
      destroy_view(empty_view);
      empty_view = null;
      sync_footer();
      sync_rows(Boolean(options.remount));
      if (measure_rows()) sync_rows(false);
      reveal_pending_target();
      notify_rows_rendered();
    },
    scrollToKey(key, options = {}) {
      const normalized_key = String(key || "").trim();
      controller.refresh();
      const index = model.indexForKey(normalized_key);
      if (index === undefined || !scroll_host) return false;
      pending_target = {
        behavior: options.behavior || "smooth",
        key: normalized_key,
        selector: options.selector || "",
      };
      const target_center = model.offsetAt(index) + model.heightAt(index) / 2;
      const delta =
        target_center - raw_viewport_top - model.viewport_height / 2;
      scroll_host.scrollTo({
        behavior: pending_target.behavior,
        top: scroll_host.scrollTop + delta,
      });
      schedule_render();
      return true;
    },
  };

  controller.refresh();
  return controller;
}
