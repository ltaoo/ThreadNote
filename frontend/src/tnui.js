import * as alert from "./tnui/alert.js";
import * as avatar from "./tnui/avatar.js";
import * as badge from "./tnui/badge.js";
import * as button from "./tnui/button.js";
import * as card from "./tnui/card.js";
import * as checkbox from "./tnui/checkbox.js";
import * as date_picker from "./tnui/date-picker.js";
import * as dialog from "./tnui/dialog.js";
import * as dropdown_menu from "./tnui/dropdown-menu.js";
import * as empty_state from "./tnui/empty-state.js";
import * as form_field from "./tnui/form-field.js";
import * as input from "./tnui/input.js";
import * as label from "./tnui/label.js";
import * as popover from "./tnui/popover.js";
import * as progress from "./tnui/progress.js";
import * as select from "./tnui/select.js";
import * as separator from "./tnui/separator.js";
import * as skeleton from "./tnui/skeleton.js";
import * as spinner from "./tnui/spinner.js";
import * as switch_component from "./tnui/switch.js";
import * as table from "./tnui/table.js";
import * as textarea from "./tnui/textarea.js";

export const tn = Object.freeze({
  ...alert,
  ...avatar,
  ...badge,
  ...button,
  ...card,
  ...checkbox,
  ...date_picker,
  ...dialog,
  ...dropdown_menu,
  ...empty_state,
  ...form_field,
  ...input,
  ...label,
  ...popover,
  ...progress,
  ...select,
  ...separator,
  ...skeleton,
  ...spinner,
  ...switch_component,
  ...table,
  ...textarea,
});

if (typeof window !== "undefined") window.tn = tn;
