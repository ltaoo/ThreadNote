import { Timeless, TimelessPrimitive } from "@/timeless-icons.js";
import {
  DEFAULT_VISIBILITY,
  VISIBILITY,
  extractProjectDirective,
  normalizeMemoPayload,
  stripProjectDirective,
} from "@/domain/memos.js";
import {
  createMemoInVault,
  errorMessage,
  saveMemos,
} from "@/domain/memo-repository.js";
import { normalizeProjectID } from "@/domain/projects.js";
import { renderTimelessView } from "@/timeless-view-mount.js";

import { HomeClipboardPageModel } from "./home_clipboard.model.js";
import { HomePageHeader, HomePageToast } from "./home_page_header.js";
import { fileInfoToUploadURL } from "./memo-editor.js";
import { formatDateTime } from "./home_memo_helpers.js";
import {
  iconActionButton,
  reactiveWhen,
} from "./home_view_shared.js";

const CLIPBOARD_AUTO_HIDE_MS = 5000;
const CLIPBOARD_MIN_VISIBLE_MS = 1500;

function clipboard_type_label(type) {
  if (type === "link") return "链接";
  if (type === "image") return "图片";
  return "文本";
}

function clipboard_action_label(type) {
  if (type === "link") return "保存链接";
  if (type === "image") return "上传文件";
  return "创建 memo";
}

export function createHomeClipboardState() {
  return {
    clipboardDisplayedId: "",
    clipboardItem: null,
    clipboardLastAppearedId: "",
    clipboardLeaving: false,
    clipboardShownAt: 0,
    clipboardTimer: null,
    clipboardVisible: false,
    clipboardWorking: false,
  };
}

export function createHomeClipboardController(options) {
  const { elements, state, ui } = options;
  const unsubscribe_card_hidden = ui.clipboardCardPresence.onHidden(
    function () {
      state.clipboardVisible = false;
      state.clipboardLeaving = false;
    },
  );

  function normalize_item(item) {
    if (!item || typeof item !== "object") return null;
    return {
      capturedAt: String(item.capturedAt || ""),
      changedAt: String(item.changedAt || ""),
      content: String(item.content || ""),
      contentBase64: String(item.contentBase64 || ""),
      dataURL: String(item.dataURL || ""),
      id: String(item.id || ""),
      mimeType: String(item.mimeType || ""),
      name: String(item.name || ""),
      rawType: String(item.rawType || ""),
      size: Number(item.size || 0),
      type: String(item.type || "text"),
    };
  }

  function request_latest(request_options = {}) {
    if (typeof invoke !== "function") return;
    const max_age_ms = Number(request_options.maxAgeMs || 0);
    let url = "/api/clipboard/latest";
    if (max_age_ms > 0) {
      url +=
        "?maxAgeSeconds=" +
        encodeURIComponent(String(Math.ceil(max_age_ms / 1000)));
    }
    invoke(url, { method: "GET" }).then(
      function (response) {
        if (!response || response.code !== 0 || !response.data) return;
        if (!response.data.found) {
          state.clipboardItem = null;
          hide_card({ forceAppeared: true });
          if (state.activeView === "clipboard") options.renderMainContent();
          options.renderViewButtons();
          return;
        }
        const item = normalize_item(response.data.item);
        if (!item || !item.id) return;
        state.clipboardItem = item;
        if (state.activeView === "clipboard") options.renderMainContent();
        options.renderViewButtons();
        if (max_age_ms > 0 && response.data.fresh === false) {
          hide_card({ forceAppeared: true });
          return;
        }
        if (options.isForeground()) show_card();
      },
      function () {},
    );
  }

  function show_card() {
    if (!state.clipboardItem) return;
    const item_id = String(state.clipboardItem.id || "");
    const same_active_item = Boolean(
      (state.clipboardVisible || state.clipboardLeaving) &&
        item_id &&
        state.clipboardDisplayedId === item_id,
    );
    if (item_id && state.clipboardLastAppearedId === item_id) return;
    if (same_active_item) {
      if (state.clipboardLeaving) {
        state.clipboardLeaving = false;
        state.clipboardVisible = true;
        state.clipboardShownAt = Date.now();
        sync_card_presence();
        schedule_auto_hide();
      }
      return;
    }
    state.clipboardDisplayedId = item_id;
    state.clipboardLastAppearedId = "";
    state.clipboardShownAt = Date.now();
    state.clipboardLeaving = false;
    state.clipboardVisible = true;
    sync_card_presence();
    schedule_auto_hide();
  }

  function schedule_auto_hide() {
    if (state.clipboardTimer) window.clearTimeout(state.clipboardTimer);
    state.clipboardTimer = window.setTimeout(function () {
      if (!state.clipboardWorking) hide_card();
    }, CLIPBOARD_AUTO_HIDE_MS);
  }

  function mark_appeared_if_ready(hide_options = {}) {
    const item_id = String(state.clipboardDisplayedId || "");
    if (!item_id) return;
    const visible_for = Date.now() - Number(state.clipboardShownAt || 0);
    if (hide_options.forceAppeared || visible_for >= CLIPBOARD_MIN_VISIBLE_MS) {
      state.clipboardLastAppearedId = item_id;
    }
  }

  function hide_card(hide_options = {}) {
    if (state.clipboardTimer) {
      window.clearTimeout(state.clipboardTimer);
      state.clipboardTimer = null;
    }
    if (!state.clipboardVisible && !state.clipboardLeaving) {
      sync_card_presence();
      return;
    }
    mark_appeared_if_ready(hide_options);
    state.clipboardLeaving = true;
    sync_card_presence();
  }

  function sync_card_presence() {
    if (
      (!state.clipboardVisible && !state.clipboardLeaving) ||
      !state.clipboardItem
    ) {
      ui.clipboardCardPresence.hide();
      return;
    }
    if (state.clipboardLeaving) {
      ui.clipboardCardPresence.hide();
      return;
    }
    ui.clipboardCardPresence.show();
  }

  function render_clipboard_view() {
    options.beforeRender();
    const item = state.clipboardItem;
    let captured_at = "";
    if (item && item.capturedAt) {
      captured_at = formatDateTime(new Date(item.capturedAt));
    }
    const meta = [
      clipboard_type_label(item && item.type),
      captured_at,
      (item && item.rawType) || "",
    ]
      .filter(Boolean)
      .join(" / ");
    renderTimelessView(
      elements.memoList,
      ClipboardCurrentView({
        actionLabel: clipboard_action_label(item && item.type),
        item,
        meta,
        working: state.clipboardWorking,
      }),
    );
  }

  function upload_image(item) {
    if (!item.contentBase64 && !item.dataURL) {
      return Promise.reject(new Error("剪贴板图片为空"));
    }
    return fileInfoToUploadURL({
      name: item.name || "clipboard.png",
      type: item.mimeType || "image/png",
      url: item.dataURL || item.contentBase64,
    }).then(function (uploaded) {
      const name = uploaded.name || item.name || "clipboard.png";
      const url = uploaded.ref || uploaded.url || item.dataURL;
      return create_memo_from_content(
        `![${name}](${url})`,
        "图片已上传并保存",
      );
    });
  }

  function extract_yaml_frontmatter(content) {
    const value = String(content || "");
    const match =
      value.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/) ||
      value.match(/^```ya?ml\s*\r?\n([\s\S]*?)\r?\n```\s*\r?\n?/);
    if (!match) return { meta: {}, stripped: value };
    const meta = {};
    match[1].split(/\r?\n/).forEach(function (source_line) {
      const line = source_line.trim();
      if (!line || line.startsWith("#")) return;
      const colon = line.indexOf(":");
      if (colon < 0) return;
      const key = line.slice(0, colon).trim();
      let field_value = line.slice(colon + 1).trim();
      if (
        (field_value[0] === '"' && field_value[field_value.length - 1] === '"') ||
        (field_value[0] === "'" && field_value[field_value.length - 1] === "'")
      ) {
        field_value = field_value.slice(1, -1);
      }
      meta[key] = field_value;
    });
    return { meta, stripped: value.slice(match[0].length) };
  }

  function frontmatter_meta(raw_meta) {
    const result = {};
    if (raw_meta.createdAt) {
      const timestamp = options.parseDisplayTime(raw_meta.createdAt);
      if (timestamp !== null) result.createdAt = new Date(timestamp).toISOString();
    }
    if (raw_meta.updatedAt) {
      const timestamp = options.parseDisplayTime(raw_meta.updatedAt);
      if (timestamp !== null) result.updatedAt = new Date(timestamp).toISOString();
    }
    if (raw_meta.visibility) {
      const visibility = String(raw_meta.visibility).trim().toUpperCase();
      if (Object.prototype.hasOwnProperty.call(VISIBILITY, visibility)) {
        result.visibility = visibility;
      }
    }
    if (raw_meta.private !== undefined) {
      result.private = String(raw_meta.private).trim().toLowerCase() === "true";
    }
    if (raw_meta.pinned !== undefined) {
      result.pinned = String(raw_meta.pinned).trim().toLowerCase() === "true";
    }
    if (raw_meta.archived !== undefined) {
      result.archived = String(raw_meta.archived).trim().toLowerCase() === "true";
    }
    if (raw_meta.projectId !== undefined) {
      result.projectId = normalizeProjectID(raw_meta.projectId);
    }
    if (raw_meta.kind !== undefined) result.kind = String(raw_meta.kind).trim();
    if (raw_meta.taskId !== undefined) {
      result.taskId = String(raw_meta.taskId).trim();
    }
    if (raw_meta.alias !== undefined) result.alias = String(raw_meta.alias).trim();
    return result;
  }

  function create_memo_from_content(content, success_message) {
    const text = String(content || "").trim();
    if (!text) return Promise.reject(new Error("剪贴板内容为空"));
    const yaml_result = extract_yaml_frontmatter(text);
    const yaml_meta = frontmatter_meta(yaml_result.meta);
    const project_ref = extractProjectDirective(yaml_result.stripped);
    let resolve_project = Promise.resolve(null);
    if (project_ref) resolve_project = options.resolveProject(project_ref);
    return resolve_project
      .then(function (resolved_project_id) {
        let final_content = yaml_result.stripped;
        if (project_ref) final_content = stripProjectDirective(final_content);
        const final_project_id =
          yaml_meta.projectId || resolved_project_id || state.composerProjectId;
        const visibility = yaml_meta.visibility || state.visibility;
        const is_secret = visibility === "SECRET";
        let stored_visibility = visibility;
        if (is_secret) stored_visibility = "PRIVATE";
        const meta = {
          alias: yaml_meta.alias,
          archived: yaml_meta.archived,
          createdAt: yaml_meta.createdAt,
          kind: yaml_meta.kind,
          pinned: yaml_meta.pinned,
          taskId: yaml_meta.taskId,
          updatedAt: yaml_meta.updatedAt,
        };
        if (yaml_meta.private !== undefined) meta.private = yaml_meta.private;
        return createMemoInVault(
          final_content,
          stored_visibility,
          final_project_id,
          is_secret,
          meta,
        );
      })
      .then(function (memo) {
        const normalized = normalizeMemoPayload(memo);
        if (!normalized) throw new Error("创建 memo 失败");
        state.memos = [normalized].concat(state.memos);
        saveMemos(state.memos);
        options.rememberComposerProject(state.composerProjectId);
        state.activeView = "memos";
        state.activeFilter = "all";
        options.clearActiveTags();
        options.clearSelectedDate();
        state.visibility = DEFAULT_VISIBILITY;
        options.renderAll();
        options.refreshTasks();
        options.showToast(success_message || "已保存");
        return normalized;
      });
  }

  function accept_item() {
    const item = state.clipboardItem;
    if (!item || state.clipboardWorking) return;
    state.clipboardWorking = true;
    if (state.activeView === "clipboard") render_clipboard_view();
    let task = create_memo_from_content(item.content, "已创建 memo");
    if (item.type === "image") task = upload_image(item);
    else if (item.type === "link") {
      task = create_memo_from_content(item.content, "链接已保存");
    }
    task
      .then(
        function () {
          hide_card({ forceAppeared: true });
        },
        function (error) {
          options.showToast(errorMessage(error));
        },
      )
      .finally(function () {
        state.clipboardWorking = false;
        if (state.activeView === "clipboard") render_clipboard_view();
      });
  }

  function destroy() {
    if (state.clipboardTimer) window.clearTimeout(state.clipboardTimer);
    unsubscribe_card_hidden?.();
    ui.clipboardCardPresence.unmount();
  }

  return {
    acceptClipboardItem: accept_item,
    destroy,
    hideClipboardCard: hide_card,
    renderClipboardCard: sync_card_presence,
    renderClipboardView: render_clipboard_view,
    requestClipboardLatest: request_latest,
    showClipboardCard: show_card,
  };
}

export function extractYamlFrontmatter(content) {
  const value = String(content || "");
  const match =
    value.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/) ||
    value.match(/^```ya?ml\s*\r?\n([\s\S]*?)\r?\n```\s*\r?\n?/);
  if (!match) return { meta: {}, stripped: value };
  const meta = {};
  match[1].split(/\r?\n/).forEach(function (source_line) {
    const line = source_line.trim();
    if (!line || line.startsWith("#")) return;
    const colon = line.indexOf(":");
    if (colon < 0) return;
    const key = line.slice(0, colon).trim();
    let field_value = line.slice(colon + 1).trim();
    if (
      (field_value[0] === '"' && field_value[field_value.length - 1] === '"') ||
      (field_value[0] === "'" && field_value[field_value.length - 1] === "'")
    ) {
      field_value = field_value.slice(1, -1);
    }
    meta[key] = field_value;
  });
  return { meta, stripped: value.slice(match[0].length) };
}

export function applyYamlFrontmatterMeta(raw_meta, parse_display_time) {
  const result = {};
  if (raw_meta.createdAt) {
    const timestamp = parse_display_time(raw_meta.createdAt);
    if (timestamp !== null) result.createdAt = new Date(timestamp).toISOString();
  }
  if (raw_meta.updatedAt) {
    const timestamp = parse_display_time(raw_meta.updatedAt);
    if (timestamp !== null) result.updatedAt = new Date(timestamp).toISOString();
  }
  if (raw_meta.visibility) {
    const visibility = String(raw_meta.visibility).trim().toUpperCase();
    if (Object.prototype.hasOwnProperty.call(VISIBILITY, visibility)) {
      result.visibility = visibility;
    }
  }
  if (raw_meta.private !== undefined) {
    result.private = String(raw_meta.private).trim().toLowerCase() === "true";
  }
  if (raw_meta.pinned !== undefined) {
    result.pinned = String(raw_meta.pinned).trim().toLowerCase() === "true";
  }
  if (raw_meta.archived !== undefined) {
    result.archived = String(raw_meta.archived).trim().toLowerCase() === "true";
  }
  if (raw_meta.projectId !== undefined) {
    result.projectId = normalizeProjectID(raw_meta.projectId);
  }
  if (raw_meta.kind !== undefined) result.kind = String(raw_meta.kind).trim();
  if (raw_meta.taskId !== undefined) result.taskId = String(raw_meta.taskId).trim();
  if (raw_meta.alias !== undefined) result.alias = String(raw_meta.alias).trim();
  return result;
}

export function HomeClipboardContentView(props) {
  return ClipboardCurrentView(props);
}

/** @param {import("./home.models").HomePageProps} props */
export default function HomeClipboardPageView(props) {
  const vm$ = HomeClipboardPageModel(props);
  return View(
    {
      class: "page home-clipboard-page w-full h-full",
      dataset: { pathname: vm$.state.pathname, section: vm$.state.section },
      onMounted(event) {
        vm$.methods.init(event);
      },
      onUnmounted() {
        vm$.destroy();
      },
    },
    [
      HomePageHeader({
        eyebrow: vm$.ui.mainEyebrow,
        meaning: "home-clipboard-header",
        subtitle: vm$.ui.mainSubtitle,
        title: vm$.ui.mainTitle,
      }),
      View(
        {
          as: "main",
          class: vm$.ui.memoMainClass,
          attributes: {
            "data-home-page-main": "true",
            n: "home-clipboard-main",
          },
        },
        [
          View(
            {
              as: "section",
              class: vm$.ui.memoListClass,
              attributes: {
                "data-memo-list": "true",
                n: "home-clipboard-content",
              },
            },
            [],
          ),
        ],
      ),
      HomePageToast({ className: vm$.ui.toastClass, text: vm$.ui.toastText }),
    ],
  );
}

export function ClipboardCurrentView(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const { Button, Img, View } = runtime;
  if (!props.item?.id) {
    return View(
      {
        class: "memo-empty-state",
        attributes: { n: "memo-clipboard-current-empty" },
      },
      [
        View(
          {
            class: "memo-empty-icon",
            attributes: { n: "memo-clipboard-current-empty-icon" },
          },
          [
            Timeless.Icon({
              name: "copy",
              attributes: { n: "memo-clipboard-current-empty-symbol" },
            }),
          ],
        ),
        View(
          { as: "h2", attributes: { n: "memo-clipboard-current-empty-title" } },
          ["暂无粘贴板内容"],
        ),
        Button(
          {
            class: "tn-button tn-button--secondary memo-secondary-button",
            attributes: {
              "data-action": "clipboardRefresh",
              n: "memo-clipboard-current-refresh",
              type: "button",
            },
          },
          ["刷新"],
        ),
      ],
    );
  }
  const item = props.item;
  let icon_name = "copy";
  if (item.type === "image") {
    icon_name = "image";
  } else if (item.type === "link") {
    icon_name = "file-symlink";
  }
  return View(
    {
      as: "article",
      class:
        "memo-resource-card memo-clipboard-current is-" + (item.type || "text"),
      attributes: { n: "memo-clipboard-current" },
    },
    [
      View(
        {
          as: "header",
          class: "memo-clipboard-current-head",
          attributes: { n: "memo-clipboard-current-header" },
        },
        [
          View(
            {
              class: "memo-resource-target memo-clipboard-current-summary",
              attributes: { n: "memo-clipboard-current-summary" },
            },
            [
              View(
                {
                  as: "span",
                  class: "memo-resource-icon",
                  attributes: { n: "memo-clipboard-current-icon" },
                },
                [
                  Timeless.Icon({
                    name: icon_name,
                    attributes: { n: "memo-clipboard-current-symbol" },
                  }),
                ],
              ),
              View(
                {
                  as: "span",
                  class: "memo-resource-body",
                  attributes: { n: "memo-clipboard-current-details" },
                },
                [
                  View(
                    {
                      as: "span",
                      class: "memo-resource-title",
                      attributes: { n: "memo-clipboard-current-title" },
                    },
                    ["当前粘贴板的内容"],
                  ),
                  View(
                    {
                      as: "span",
                      class: "memo-resource-url",
                      attributes: { n: "memo-clipboard-current-meta" },
                    },
                    [props.meta],
                  ),
                ],
              ),
            ],
          ),
          View(
            {
              class: "memo-clipboard-current-actions",
              attributes: { n: "memo-clipboard-current-actions" },
            },
            [
              iconActionButton(runtime, {
                action: "clipboardRefresh",
                class: "tn-button tn-button--secondary memo-secondary-button",
                icon: "undo2",
                label: "刷新",
                meaning: "memo-clipboard-current-refresh",
                text: "刷新",
              }),
              iconActionButton(runtime, {
                action: "clipboardAccept",
                class: "tn-button tn-button--primary memo-primary-button",
                disabled: props.working,
                icon: "plus",
                label: props.actionLabel,
                meaning: "memo-clipboard-current-save",
                text: props.actionLabel,
              }),
            ],
          ),
        ],
      ),
      View(
        {
          class: "memo-clipboard-current-preview",
          attributes: { n: "memo-clipboard-current-preview" },
        },
        [
          Show({
            when: reactiveWhen(
              item.type === "image" && item.dataURL,
            ),
            ok() {
              return Img({
                class: "memo-clipboard-current-image",
                attributes: {
                  alt: "当前粘贴板图片",
                  n: "memo-clipboard-current-image",
                  src: item.dataURL,
                },
              });
            },
            else() {
              return View(
                {
                  as: "pre",
                  class: "memo-clipboard-current-text",
                  attributes: { n: "memo-clipboard-current-text" },
                },
                [item.content || "空内容"],
              );
            },
          }),
        ],
      ),
    ],
  );
}


// __HOME_CLIPBOARD_VIEWS__
