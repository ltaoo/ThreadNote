import { buildMemoReferenceIndex } from "./domain/memos.js";
import {
  readTodoDetailPayload,
  TodoDetailModel,
} from "./todo-detail-model.js?v=20260820-todo-detail-dialog-brand";
import {
  buildReadonlyCommentView,
  buildReadonlyMemoView,
} from "./comment-replies.model.js";
import { TimelessPrimitive } from "./timeless-icons.js";
import { detachedMemoRenderContext } from "./pages/home/memo-view-model.js";

function presentation(snapshot) {
  if (!snapshot || !snapshot.found || !snapshot.memo || !snapshot.todo) {
    return { comment: null, contextCount: 0, memo: null, todo: null };
  }
  const render_state = {
    memoRefIndex: buildMemoReferenceIndex(snapshot.memos),
    memos: snapshot.memos,
  };
  const render_context = detachedMemoRenderContext(render_state, "", {
    readonly: true,
  });
  return {
    comment: snapshot.comment
      ? buildReadonlyCommentView(
          { comment: snapshot.comment, replyCount: 0 },
          render_context,
        )
      : null,
    contextCount: snapshot.comment ? 2 : 1,
    memo: buildReadonlyMemoView(snapshot.memo, render_context),
    todo: snapshot.todo,
  };
}

function default_services() {
  return typeof globalThis.invoke === "function"
    ? { request: globalThis.invoke }
    : {
        readLocal(id) {
          return readTodoDetailPayload(globalThis.localStorage, id);
        },
      };
}

export function TodoWindowModel(props = {}) {
  const runtime = props.runtime || TimelessPrimitive;
  if (!runtime?.defineModel || !runtime?.ref) {
    throw new Error("TodoWindowModel requires the Timeless runtime");
  }
  const detail_model =
    props.detailModel || new TodoDetailModel(props.services || default_services());
  const comment_ = runtime.ref(null);
  const context_count_ = runtime.ref(0);
  const error_ = runtime.ref("");
  const found_ = runtime.ref(false);
  const loading_ = runtime.ref(false);
  const memo_ = runtime.ref(null);
  const query_ = runtime.ref("");
  const todo_ = runtime.ref(null);
  let destroyed_ = false;
  let remove_update_listener_ = null;
  let request_id_ = 0;

  function apply_snapshot(snapshot) {
    const view_state = presentation(snapshot);
    comment_.as(view_state.comment);
    context_count_.as(view_state.contextCount);
    error_.as(String((snapshot && snapshot.error) || ""));
    found_.as(Boolean(snapshot && snapshot.found));
    loading_.as(Boolean(snapshot && snapshot.loading));
    memo_.as(view_state.memo);
    query_.as(String((snapshot && snapshot.query) || "").trim());
    todo_.as(view_state.todo);
  }

  const methods = {
    init(todo_id) {
      if (typeof globalThis.onGoMessage === "function") {
        remove_update_listener_ = globalThis.onGoMessage(function (payload) {
          if (
            payload &&
            payload.type === "todo_detail_updated" &&
            payload.todoId === todo_id
          ) {
            methods.load(todo_id);
          }
        });
      }
      return methods.load(todo_id);
    },

    async load(todo_id) {
      if (destroyed_) return false;
      request_id_ += 1;
      const current_request_id = request_id_;
      loading_.as(true);
      error_.as("");
      found_.as(false);
      const snapshot = await detail_model.load(todo_id);
      if (destroyed_ || current_request_id !== request_id_) return false;
      apply_snapshot(snapshot);
      return Boolean(snapshot && snapshot.found);
    },
  };

  const model = runtime.defineModel({
    state: {
      comment: comment_,
      contextCount: context_count_,
      error: error_,
      found: found_,
      loading: loading_,
      memo: memo_,
      query: query_,
      todo: todo_,
    },
    methods,
  });
  const destroy_model = model.destroy.bind(model);
  model.destroy = function () {
    if (destroyed_) return;
    destroyed_ = true;
    request_id_ += 1;
    if (typeof remove_update_listener_ === "function") {
      remove_update_listener_();
    }
    if (typeof detail_model.destroy === "function") detail_model.destroy();
    destroy_model();
  };
  return model;
}
