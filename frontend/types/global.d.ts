declare namespace Dayjs {
  interface Dayjs {
    format(template?: string): string;
    add(value: number, unit: string): Dayjs;
    subtract(value: number, unit: string): Dayjs;
    isValid(): boolean;
    // 添加其他你需要的方法
  }

  function dayjs(date?: string | number | Date): Dayjs;
  function extend(plugin: any): void;
}

declare const dayjs: typeof Dayjs.dayjs;

declare function invoke(
  url: string,
  options: {
    method: string;
    headers?: Record<string, unknown[]>;
    args?: Record<string, unknown>;
  },
): Promise<any>;

declare interface Window {
  dayjs: typeof dayjs;
}
// Global Core Functions
declare const ref: typeof import("../src/components/ui/core").ref;
declare const computed: typeof import("../src/components/ui/core").computed;
declare const isRef: typeof import("../src/components/ui/core").isRef;
declare const classnames: typeof import("../src/components/ui/core").classnames;

declare const Show: typeof import("../src/components/ui/show").Show;
declare const For: typeof import("../src/components/ui/for").For;
declare const Match: typeof import("../src/components/ui/match").Match;
declare const Slider: typeof import("../src/components/ui/slider").Slider;
declare const Slide: typeof import("../src/components/ui/slider").Slider;
declare const Progress: typeof import("../src/components.js").Progress;
// Global Components
declare const View: typeof import("../src/components/ui/view").View;
declare const DangerouslyInnerHTML: typeof import("../src/components/ui/html").DangerouslyInnerHTML;
declare const Txt: typeof import("../src/components/ui/text").Txt;
declare const ScrollView: typeof import("../src/components/ui/scrollview").ScrollView;
declare const Flex: typeof import("../src/components/ui/flex").Flex;
declare const Button: typeof import("../src/components.js").Button;
declare const IconButton: typeof import("../src/components.js").IconButton;
declare const Input: typeof import("../src/components.js").Input;
declare const Textarea: typeof import("../src/components.js").Textarea;
declare const Checkbox: typeof import("../src/components.js").Checkbox;
declare const Select: typeof import("../src/components.js").Select;
declare const ProjectSelect: typeof import("../src/components.js").ProjectSelect;
declare const DatePicker: typeof import("../src/components.js").DatePicker;
declare const Dialog: typeof import("../src/components.js").Dialog;
declare const DialogHeader: typeof import("../src/components.js").DialogHeader;
declare const DialogTitle: typeof import("../src/components.js").DialogTitle;
declare const DialogDescription: typeof import("../src/components.js").DialogDescription;
declare const DialogBody: typeof import("../src/components.js").DialogBody;
declare const DialogFooter: typeof import("../src/components.js").DialogFooter;
declare const Popover: typeof import("../src/components.js").Popover;
declare const FormField: typeof import("../src/components.js").FormField;
declare const Label: typeof import("../src/components.js").Label;
declare const Badge: typeof import("../src/components.js").Badge;
declare const Avatar: typeof import("../src/components.js").Avatar;
declare const Card: typeof import("../src/components.js").Card;
declare const CardHeader: typeof import("../src/components.js").CardHeader;
declare const CardTitle: typeof import("../src/components.js").CardTitle;
declare const CardDescription: typeof import("../src/components.js").CardDescription;
declare const CardContent: typeof import("../src/components.js").CardContent;
declare const CardFooter: typeof import("../src/components.js").CardFooter;
declare const Table: typeof import("../src/components.js").Table;
declare const TableHeader: typeof import("../src/components.js").TableHeader;
declare const TableBody: typeof import("../src/components.js").TableBody;
declare const TableRow: typeof import("../src/components.js").TableRow;
declare const TableHead: typeof import("../src/components.js").TableHead;
declare const TableCell: typeof import("../src/components.js").TableCell;
declare const Alert: typeof import("../src/components.js").Alert;
declare const AlertTitle: typeof import("../src/components.js").AlertTitle;
declare const AlertDescription: typeof import("../src/components.js").AlertDescription;
declare const EmptyState: typeof import("../src/components.js").EmptyState;
declare const Skeleton: typeof import("../src/components.js").Skeleton;
declare const Separator: typeof import("../src/components.js").Separator;
declare const Spinner: typeof import("../src/components.js").Spinner;
declare const Icon: typeof import("../src/components.js").Icon;
declare const MemoCard: typeof import("../src/components.js").MemoCard;
declare const SmallCalendar: typeof import("../src/components.js").SmallCalendar;
declare const createButtonModel: typeof import("../src/components.js").createButtonModel;
declare const createInputModel: typeof import("../src/components.js").createInputModel;
declare const createCheckboxModel: typeof import("../src/components.js").createCheckboxModel;
declare const createSwitchModel: typeof import("../src/components.js").createSwitchModel;
declare const createSelectModel: typeof import("../src/components.js").createSelectModel;
declare const createProjectSelectModel: typeof import("../src/components.js").createProjectSelectModel;
declare const createDatePickerModel: typeof import("../src/components.js").createDatePickerModel;
declare const createDialogModel: typeof import("../src/components.js").createDialogModel;
declare const createPopoverModel: typeof import("../src/components.js").createPopoverModel;
declare const createProgressModel: typeof import("../src/components.js").createProgressModel;
declare const createMemoCardModel: typeof import("../src/components.js").createMemoCardModel;
declare const createSmallCalendarModel: typeof import("../src/components.js").createSmallCalendarModel;
declare const Presence: typeof import("../src/components/ui/presence").Presence;
declare const Portal: typeof import("../src/components/ui/portal").Portal;
declare const Popper: typeof import("../src/components/ui/popper").Popper;
declare const Toggle: typeof import("../src/components/ui/toggle").Toggle;
declare const Switch: typeof import("../src/components.js").Switch;

declare const Menu: typeof import("../src/components/ui/menu").Menu;
declare const MenuItem: typeof import("../src/components/ui/menu").MenuItem;
declare const MenuLabel: typeof import("../src/components/ui/menu").MenuLabel;
declare const MenuSeparator: typeof import("../src/components/ui/menu").MenuSeparator;
declare const DropdownMenu: typeof import("../src/components/ui/menu").DropdownMenu;

declare const Tabs: typeof import("../src/components/ui/tabs").Tabs;
declare const Steps: typeof import("../src/components/ui/steps").Steps;

declare var TimelessWeb: {
  provide_http_client: (vm: any) => void;
  provide_ui_scroll_view_scroll: (vm: any, elm: HTMLDivElement) => void;
  provide_ui_scroll_view_indicator: (vm: any, elm: HTMLDivElement) => void;
};
