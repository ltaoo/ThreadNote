import {
  DEFAULT_VISIBILITY,
  extractProjectDirective,
  stripProjectDirective,
} from "@/domain/memos.js";
import { normalizeProjectID } from "@/domain/projects.js";
import {
  errorMessage,
  updateMemoInVault,
} from "@/domain/memo-repository.js";
import {
  deleteMemoDraftInVault,
  memoEditDraftId,
  upsertMemoDraftInVault,
} from "@/domain/memo-drafts.js";
import { TimelessPrimitive } from "@/timeless-icons.js";

function initial_visibility(memo) {
  const visibility = memo.visibility || DEFAULT_VISIBILITY;
  return memo.private && visibility === "PRIVATE" ? "SECRET" : visibility;
}

function parse_front_matter(value) {
  let content = String(value || "");
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  const metadata = {};
  if (!match) return { content, metadata };

  match[1].split(/\r?\n/).forEach(function (raw_line) {
    const line = raw_line.trim();
    if (!line || line.charAt(0) === "#") return;
    const colon = line.indexOf(":");
    if (colon < 0) return;
    const key = line.slice(0, colon).trim();
    let raw_value = line.slice(colon + 1).trim();
    if (
      (raw_value.charAt(0) === '"' && raw_value.at(-1) === '"') ||
      (raw_value.charAt(0) === "'" && raw_value.at(-1) === "'")
    ) {
      raw_value = raw_value.slice(1, -1);
    }
    if (key === "createdAt" || key === "updatedAt") {
      const parsed = parse_display_date_time(raw_value);
      if (parsed) metadata[key] = parsed;
      return;
    }
    metadata[key] = raw_value;
  });
  content = content.slice(match[0].length);
  return { content, metadata };
}

function parse_display_date_time(value) {
  const match = String(value)
    .trim()
    .match(
      /^(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})[\sT](\d{1,2}):(\d{1,2}):(\d{1,2})$/,
    );
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function boolean_metadata(value) {
  return String(value).toLowerCase() === "true";
}

export function MemoEditDialogModel(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  const context = props.context || {};
  const memo = context.memo;
  if (!memo) throw new Error("MemoEditDialogModel requires context.memo");
  if (!runtime?.defineModel || !runtime?.ref) {
    throw new Error("MemoEditDialogModel requires the Timeless runtime");
  }

  const callbacks = {
    onClose:
      typeof context.onClose === "function" ? context.onClose : function () {},
    onDraftDelete:
      typeof context.onDraftDelete === "function"
        ? context.onDraftDelete
        : function () {},
    onDraftUpsert:
      typeof context.onDraftUpsert === "function"
        ? context.onDraftUpsert
        : function () {},
    onSaveComplete:
      typeof context.onSaveComplete === "function"
        ? context.onSaveComplete
        : function () {},
    resolveOrCreateProject:
      typeof context.resolveOrCreateProject === "function"
        ? context.resolveOrCreateProject
        : function () {
            return Promise.resolve("");
          },
    showToast:
      typeof context.showToast === "function"
        ? context.showToast
        : function () {},
  };
  const services = {
    deleteMemoDraftInVault,
    updateMemoInVault,
    upsertMemoDraftInVault,
    ...(props.services || {}),
  };
  const draft_ = runtime.ref(
    context.initialDraft || context.initialDraft === ""
      ? context.initialDraft
      : memo.content || "",
  );
  const focus_request_ = runtime.ref(0);
  const preview_visible_ = runtime.ref(false);
  const project_id_ = runtime.ref(normalizeProjectID(memo.projectId));
  const saving_ = runtime.ref(false);
  const visibility_ = runtime.ref(initial_visibility(memo));
  let destroyed_ = false;

  function request_focus() {
    if (!destroyed_) focus_request_.as(focus_request_.value + 1);
  }

  function set_saving(value) {
    if (!destroyed_) saving_.as(Boolean(value));
  }

  async function discard_draft(options = {}) {
    if (destroyed_ || !memo.id) return { ok: false };
    const draft_id = memoEditDraftId(memo.id);
    callbacks.onDraftDelete(draft_id);
    try {
      await services.deleteMemoDraftInVault(draft_id);
      if (options.message) callbacks.showToast(options.message);
      return { ok: true, message: options.message || "draft discarded" };
    } catch (err) {
      const message = "删除草稿失败: " + errorMessage(err);
      callbacks.showToast(message);
      return { ok: false, message };
    }
  }

  async function write_draft() {
    if (destroyed_) return { ok: false };
    const content = String(draft_.value || "");
    if (!content.trim()) {
      return discard_draft({ exit: false, message: "空草稿已清理" });
    }
    const draft_payload = {
      baseUpdatedAt: memo.updatedAt || "",
      content,
      id: memoEditDraftId(memo.id),
      kind: "memo-edit",
      memoId: memo.id,
      projectId: project_id_.value,
      visibility: visibility_.value,
    };
    try {
      const draft = await services.upsertMemoDraftInVault(draft_payload);
      if (destroyed_) return { ok: false };
      callbacks.showToast("草稿已保存");
      callbacks.onDraftUpsert(draft);
      return { ok: true, message: "draft written" };
    } catch (err) {
      const message = "保存草稿失败: " + errorMessage(err);
      callbacks.showToast(message);
      return { ok: false, message };
    }
  }

  const methods = {
    async cancel() {
      if (destroyed_) return { ok: true };
      const result = await discard_draft({
        exit: true,
        message: "编辑已取消",
      });
      if (!destroyed_) callbacks.onClose();
      return result;
    },

    async exitEdit() {
      if (destroyed_) return { ok: true };
      const changed =
        String(draft_.value || "") !== String(memo.content || "") ||
        normalizeProjectID(project_id_.value) !==
          normalizeProjectID(memo.projectId) ||
        (visibility_.value || DEFAULT_VISIBILITY) !== initial_visibility(memo);
      const result = changed ? await write_draft() : { ok: true };
      if (!destroyed_) callbacks.onClose();
      return result;
    },

    requestFocus: request_focus,

    async save(options = {}) {
      if (destroyed_) {
        return { ok: false, message: "component destroyed" };
      }
      if (saving_.value) return { ok: false, message: "正在保存" };

      const parsed = parse_front_matter(draft_.value);
      const metadata = parsed.metadata;
      const content = parsed.content;
      if (!content.trim()) {
        callbacks.showToast("内容不能为空");
        request_focus();
        return { ok: false, message: "内容不能为空" };
      }

      const is_secret = visibility_.value === "SECRET";
      set_saving(true);
      try {
        const project_ref = extractProjectDirective(content);
        const resolved_project_id = project_ref
          ? await callbacks.resolveOrCreateProject(project_ref)
          : null;
        const final_content = project_ref
          ? stripProjectDirective(content)
          : content;
        const patch = {
          content: final_content,
          private:
            metadata.private != null
              ? boolean_metadata(metadata.private)
              : is_secret,
          projectId:
            metadata.projectId != null
              ? normalizeProjectID(metadata.projectId)
              : resolved_project_id || project_id_.value,
          updatedAt: metadata.updatedAt || new Date().toISOString(),
          visibility:
            metadata.visibility != null
              ? metadata.visibility
              : is_secret
                ? "PRIVATE"
                : visibility_.value,
        };
        if (metadata.createdAt !== undefined) patch.createdAt = metadata.createdAt;
        if (metadata.pinned !== undefined) patch.pinned = boolean_metadata(metadata.pinned);
        if (metadata.archived !== undefined) patch.archived = boolean_metadata(metadata.archived);
        if (metadata.kind !== undefined) patch.kind = metadata.kind;
        if (metadata.taskId !== undefined) patch.taskId = metadata.taskId;
        if (metadata.alias !== undefined) patch.alias = metadata.alias;

        await services.updateMemoInVault(memo.id, patch);
        services.deleteMemoDraftInVault(memoEditDraftId(memo.id)).catch(function () {});
        if (!destroyed_) set_saving(false);
        if (options.source !== "vim-wq") callbacks.showToast("已保存");
        callbacks.onSaveComplete(memo.id);
        return { ok: true, message: "已保存" };
      } catch (err) {
        const message = "保存失败: " + errorMessage(err);
        callbacks.showToast(message);
        if (!destroyed_) set_saving(false);
        return { ok: false, message };
      }
    },

    setDraft(value) {
      if (!destroyed_) draft_.as(String(value || ""));
    },

    setProject(project_id) {
      if (!destroyed_ && !saving_.value) {
        project_id_.as(normalizeProjectID(project_id));
      }
    },

    setVisibility(visibility) {
      if (!destroyed_ && !saving_.value) {
        visibility_.as(visibility || DEFAULT_VISIBILITY);
      }
    },

    togglePreview() {
      if (destroyed_) return;
      const visible = !preview_visible_.value;
      preview_visible_.as(visible);
      if (!visible) request_focus();
    },

    writeDraft: write_draft,
  };

  const model = runtime.defineModel({
    state: {
      draft: draft_,
      focusRequest: focus_request_,
      previewVisible: preview_visible_,
      projectId: project_id_,
      saving: saving_,
      visibility: visibility_,
    },
    methods,
  });
  const destroy_model = model.destroy.bind(model);
  model.destroy = function () {
    if (destroyed_) return;
    destroyed_ = true;
    destroy_model();
  };
  return model;
}
