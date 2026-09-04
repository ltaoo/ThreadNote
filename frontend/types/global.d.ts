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

declare interface FrontendLogBuilder {
  Str(key: string, value: unknown): FrontendLogBuilder;
  Err(error: unknown): FrontendLogBuilder;
  Object(key: string, value: unknown): FrontendLogBuilder;
  Obj(key: string, value: unknown): FrontendLogBuilder;
  Dict(key: string, value: unknown): FrontendLogBuilder;
  Interface(key: string, value: unknown): FrontendLogBuilder;
  JSON(key: string, value: unknown): FrontendLogBuilder;
  RawJSON(key: string, value: unknown): FrontendLogBuilder;
  Int(key: string, value: number): FrontendLogBuilder;
  Float(key: string, value: number): FrontendLogBuilder;
  Bool(key: string, value: boolean): FrontendLogBuilder;
  Msg(message: unknown): void;
}

declare interface FrontendLogger {
  Debug(): FrontendLogBuilder;
  Info(): FrontendLogBuilder;
  Warn(): FrontendLogBuilder;
  Error(error?: unknown): FrontendLogBuilder;
  debug(message: unknown, fields?: Record<string, unknown>): void;
  info(message: unknown, fields?: Record<string, unknown>): void;
  warn(message: unknown, fields?: Record<string, unknown>): void;
  error(message: unknown, fields?: Record<string, unknown>): void;
  log(entry: Record<string, unknown>): void;
  flushNow(options?: { unloading?: boolean }): Promise<void>;
}

declare const Logger: FrontendLogger;
declare const FrontendLogger: FrontendLogger;

declare interface Window {
  dayjs: typeof dayjs;
  FrontendLogger: FrontendLogger;
  Logger: FrontendLogger;
  tn: typeof import("../src/tnui.js").tn;
}

declare const tn: typeof import("../src/tnui.js").tn;
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
// Global Components
declare const View: typeof import("../src/components/ui/view").View;
declare const Icon: typeof import("../src/tnui.js").tn.Icon;
declare const DangerouslyInnerHTML: typeof import("../src/components/ui/html").DangerouslyInnerHTML;
declare const Txt: typeof import("../src/components/ui/text").Txt;
declare const ScrollView: typeof import("../src/components/ui/scrollview").ScrollView;
declare const Flex: typeof import("../src/components/ui/flex").Flex;
declare const Presence: typeof import("../src/components/ui/presence").Presence;
declare const Portal: typeof import("../src/components/ui/portal").Portal;
declare const Popper: typeof import("../src/components/ui/popper").Popper;
declare const Toggle: typeof import("../src/components/ui/toggle").Toggle;

declare const Menu: typeof import("../src/components/ui/menu").Menu;
declare const MenuItem: typeof import("../src/components/ui/menu").MenuItem;
declare const MenuLabel: typeof import("../src/components/ui/menu").MenuLabel;
declare const MenuSeparator: typeof import("../src/components/ui/menu").MenuSeparator;

declare const Tabs: typeof import("../src/components/ui/tabs").Tabs;
declare const Steps: typeof import("../src/components/ui/steps").Steps;

declare var TimelessWeb: {
  provide_http_client: (vm: any) => void;
  provide_ui_scroll_view_scroll: (vm: any, elm: HTMLDivElement) => void;
  provide_ui_scroll_view_indicator: (vm: any, elm: HTMLDivElement) => void;
};
