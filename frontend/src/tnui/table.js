import { semantic_props, ui } from "./runtime.js";

export function Table(props = {}, children = []) {
  return ui.TablePrimitive.Table(semantic_props(props, "tn-table", "table-root"), children);
}
export function TableHeader(props = {}, children = []) {
  return ui.TablePrimitive.TableHeader(semantic_props(props, "tn-table__header", "table-header"), children);
}
export function TableBody(props = {}, children = []) {
  return ui.TablePrimitive.TableBody(semantic_props(props, "tn-table__body", "table-body"), children);
}
export function TableRow(props = {}, children = []) {
  return ui.TablePrimitive.TableRow(semantic_props(props, "tn-table__row", "table-row"), children);
}
export function TableHead(props = {}, children = []) {
  return ui.TablePrimitive.TableHead(semantic_props(props, "tn-table__head", "table-heading-cell"), children);
}
export function TableCell(props = {}, children = []) {
  return ui.TablePrimitive.TableCell(semantic_props(props, "tn-table__cell", "table-cell"), children);
}
