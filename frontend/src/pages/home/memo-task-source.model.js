import { updateTaskLine } from "@/domain/memos.js";
import {
  loadMemoFromVault,
  updateMemoInVault,
} from "@/domain/memo-repository.js";

export async function persistMemoTaskLine(options = {}) {
  const memo_id = String(options.memoId || "").trim();
  const line_number = Number(options.line);
  if (!memo_id || !Number.isInteger(line_number) || line_number < 1) {
    return { changed: false, memo: options.memo || null };
  }

  const services = {
    loadMemoFromVault,
    updateMemoInVault,
    ...(options.services || {}),
  };
  const memo = options.memo || await services.loadMemoFromVault(memo_id);
  if (!memo || memo.id !== memo_id) {
    throw new Error("找不到来源 memo");
  }

  const lines = String(memo.content || "").split("\n");
  const line_index = line_number - 1;
  if (!lines[line_index]) return { changed: false, memo };

  const updated_line = updateTaskLine(lines[line_index], options.checked);
  if (updated_line === lines[line_index]) {
    return { changed: false, memo };
  }

  lines[line_index] = updated_line;
  const patch = {
    content: lines.join("\n"),
    updatedAt: new Date().toISOString(),
  };
  const updated_memo = { ...memo, ...patch };
  options.onLocalUpdate?.(updated_memo);
  await services.updateMemoInVault(memo_id, patch);
  return { changed: true, memo: updated_memo };
}
