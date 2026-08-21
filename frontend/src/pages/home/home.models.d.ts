import type { MemoCommentRecord } from "../../types/memo-comments";
import type { MemoDraftRecord } from "../../types/memo-drafts";
import type {
  MemoHeading,
  MemoID,
  MemoRecord,
  MemoVisibility,
  VisibilityMeta,
} from "../../types/memos";
import type {
  MemoResourceReference,
  MemoResourceType,
} from "../../types/memo-resources";
import type {
  ProjectFilter,
  ProjectID,
  ProjectRecord,
} from "../../types/projects";
import type {
  TaskPriority,
  TaskReminder,
  TaskSource,
  TaskStatus,
  TaskSummary,
} from "../../types/tasks";

export type {
  MemoCommentRecord,
  MemoDraftRecord,
  MemoHeading,
  MemoID,
  MemoRecord,
  MemoResourceReference,
  MemoResourceType,
  MemoVisibility,
  ProjectFilter,
  ProjectID,
  ProjectRecord,
  TaskPriority,
  TaskStatus,
  TaskSummary,
  VisibilityMeta,
};

export type HomeSection =
  | "boards"
  | "chat"
  | "clipboard"
  | "codeblocks"
  | "files"
  | "images"
  | "links"
  | "memos"
  | "milestones"
  | "rules"
  | "todos";

export type HomeRouteKey =
  | "board"
  | "chat"
  | "clipboard"
  | "codeblock"
  | "file"
  | "image"
  | "link"
  | "memo"
  | "milestone"
  | "rule"
  | "todo";

export type MemoListFilter =
  | ""
  | "all"
  | "archive"
  | "pinned"
  | "private"
  | "public";

export type TodoListFilter =
  | "all"
  | "completed"
  | "inbox"
  | "next"
  | "overdue"
  | "scheduled"
  | "today";

export interface HomeRouteViewState {
  visible?: boolean;
}

export interface HomeRouteView {
  curView?: HomeRouteView | null;
  name: string;
  pathname: string;
  query?: Record<string, string | undefined> & { filter?: string };
  visible?: boolean;
  onCurViewChange?(
    listener: (view: HomeRouteView | null | undefined) => void,
  ): () => void;
  onShow?(listener: () => void): () => void;
  onStateChange?(
    listener: (state: HomeRouteViewState) => void,
  ): () => void;
}

export interface HomeHistory {
  push(routeName: string, query?: Record<string, unknown>): void;
}

export interface HomePageProps {
  app?: object;
  history: HomeHistory;
  view: HomeRouteView;
  views?: Record<string, HomeRouteView>;
}

export interface HomeMemoRecord extends MemoRecord {
  alias: string;
  kind: string;
  reactions: string[];
  taskId: string;
}

export interface HomeMemoCommentRecord extends MemoCommentRecord {
  reactions: string[];
}

export interface HomeTaskSource extends TaskSource {
  commentId?: string;
}

export interface HomeTaskSummary extends TaskSummary {
  boardId: string;
  reminders: TaskReminder[];
  source: HomeTaskSource;
}

export type GTDMilestoneStatus =
  | "active"
  | "cancelled"
  | "completed"
  | "planned";

export interface GTDMilestoneRecord {
  completedAt: string;
  createdAt: string;
  id: string;
  projectIds: ProjectID[];
  reviewMemoId: MemoID | "";
  status: GTDMilestoneStatus;
  targetAt: string;
  taskIds: string[];
  title: string;
  updatedAt: string;
}

export interface BoardColumnRecord {
  id: string;
  label: string;
  order: number;
}

export type BoardRuleTriggerType =
  | "task.created"
  | "task.enterColumn"
  | "task.statusChanged";

export interface BoardRuleTrigger {
  columnId?: string;
  fromColumnId?: string;
  status?: string;
  type: BoardRuleTriggerType | string;
}

export type BoardRuleConditionOperator =
  | "contains"
  | "equals"
  | "isEmpty"
  | "isNotEmpty"
  | "notContains"
  | "notEquals";

export interface BoardRuleCondition {
  field: "priority" | "status" | "tags" | string;
  operator: BoardRuleConditionOperator | string;
  value: string;
}

export type BoardRuleActionType =
  | "addTags"
  | "moveToColumn"
  | "removeTags"
  | "setPriority"
  | "setStatus";

export interface BoardRuleActionParams {
  columnId?: string;
  priority?: TaskPriority | string;
  status?: TaskStatus | string;
  tags?: string[];
}

export interface BoardRuleAction {
  params: BoardRuleActionParams;
  type: BoardRuleActionType | string;
}

export interface BoardRuleRecord {
  actions: BoardRuleAction[];
  conditions: BoardRuleCondition[];
  enabled: boolean;
  id: string;
  name: string;
  order: number;
  trigger: BoardRuleTrigger;
}

export interface BoardRecord {
  columns: BoardColumnRecord[];
  createdAt: string;
  id: string;
  projectId: ProjectID | "";
  rules: BoardRuleRecord[];
  title: string;
  updatedAt: string;
}

export interface BoardPreset {
  columns: BoardColumnRecord[];
  rules: BoardRuleRecord[];
  title: string;
}

export interface HomeResourceItem extends MemoResourceReference {
  fetched?: boolean;
  href?: string;
  host?: string;
  source?: string;
  title?: string;
}

export interface HomeFileItem {
  badge: string;
  href: string;
  id: string;
  kind: string;
  kindLabel: string;
  memoId: MemoID;
  name: string;
  previewSrc: string;
  url: string;
}

export interface HomeImageItem {
  label: string;
  memoId: MemoID;
  source: string;
  src: string;
}

export interface HomeMetaPresentation {
  action?: string;
  class?: string;
  commentId?: string;
  completedAt?: string;
  datetime?: string;
  label: string;
  memoId?: MemoID;
  time?: boolean;
  title?: string;
}

export interface HomeActionPresentation {
  action: string;
  danger?: boolean;
  icon: string;
  label: string;
}

export interface HomeTaskPresentation {
  actions: HomeActionPresentation[];
  badge: string;
  complete: boolean;
  id: string;
  meta: HomeMetaPresentation[];
  note?: string;
  priority: TaskPriority | string;
  private?: boolean;
  title: string;
}

export interface MemoProjectPresentation {
  color: string;
  name: string;
}

export interface MemoCommentPresentation {
  active: ReactiveRef<boolean>;
  editing: boolean;
  hasHistory: boolean;
  html: string;
  id: string;
  onMouseEnter(): void;
  onMouseLeave(): void;
  onReactionMenuMouseEnter(): void;
  onReactionMenuMouseLeave(): void;
  private: boolean;
  reactionMenu: unknown;
  reactionMenuDestroy(): void;
  reactions: string[];
  relativeTime: string;
  replyCount: number;
  replyLabel: string;
  replyTitle: string;
  replyTo: string;
  time: string;
}

export interface MemoCardPresentation {
  alias: string;
  archived: boolean;
  backlinks: number;
  className: string;
  commentCount: number;
  commentVisibility: MemoVisibility | string;
  commenting: boolean;
  comments: HomeMemoCommentRecord[];
  commentsExpanded: boolean;
  commentsOverflow: boolean;
  commentsToggleLabel: string;
  createdAt: string;
  editing: boolean;
  editVisibility: MemoVisibility | "SECRET" | string;
  error?: string;
  expanded: boolean;
  hasHistory: boolean;
  hasToc: boolean;
  headings: Array<MemoHeading & { depth: number; lineNumber: number }>;
  html: string;
  id: MemoID;
  lineCount: string;
  moreMenu?: unknown;
  moreMenuDestroy?(): void;
  pinned: boolean;
  private: boolean;
  project: MemoProjectPresentation | null;
  projectId: ProjectID | "";
  reactionMenu?: unknown;
  reactionMenuDestroy?(): void;
  reactions: string[];
  relativeTime: string;
  short: boolean;
  showVisibility: boolean;
  stats: string[];
  tags: string[];
  tocVisible: boolean;
  visibility: VisibilityMeta;
  visibleComments: MemoCommentPresentation[];
}

export interface MemoCardViewModel extends MemoCardPresentation {
  active: ReactiveRef<boolean>;
  clearActive(): false;
  destroy(): void;
  isActiveSource(source: string): boolean;
  onMoreMenuMouseEnter(): boolean;
  onMoreMenuMouseLeave(): boolean;
  onMouseEnter(): boolean;
  onMouseLeave(): boolean;
  reactionMenuDestroy(): void;
  setActive(active: boolean, source?: string): boolean;
  setMoreMenuOpen(open: boolean): boolean;
  setReactionMenuOpen(open: boolean): boolean;
  updatePresentation(presentation: Partial<MemoCardPresentation>): this;
}

export interface MemoListConditions {
  [name: string]: unknown;
  activeFilter?: MemoListFilter;
  activeProjectFilter?: ProjectFilter;
  activeTag?: string;
  comments?: ReadonlyArray<Pick<HomeMemoCommentRecord, "content" | "memoId">>;
  date?: string;
  filter?: MemoListFilter;
  projectFilter?: ProjectFilter;
  query?: string;
  selectedDate?: string;
  sortDesc?: boolean;
  tag?: string;
}

export interface MemoListServices {
  loadMemosFromVault(): Promise<unknown[]>;
}

export interface MemoListModelOptions {
  conditions?: MemoListConditions;
  services?: Partial<MemoListServices>;
}

export interface MemoListModelInstance {
  filterList(
    memos: ReadonlyArray<HomeMemoRecord>,
    conditions?: MemoListConditions,
  ): HomeMemoRecord[];
  loadList(conditions?: MemoListConditions): Promise<HomeMemoRecord[]>;
}

export interface ReactiveRef<T> {
  readonly value: T;
  as(value: T | ((current: T) => T)): void;
  destroy?(): void;
  subscribe(
    listener: ((value: T) => void) | { onChange(value: T): void },
  ): () => void;
}

export interface HomeElementRegistry {
  [name: string]: Element | null | undefined;
  attachInput?: HTMLInputElement | null;
  calendar?: HTMLElement | null;
  composerHost?: HTMLElement | null;
  memoList?: HTMLElement | null;
  memoMain?: HTMLElement | null;
  projectFilterSelect?: HTMLSelectElement | null;
  projectList?: HTMLElement | null;
  projectSelect?: HTMLSelectElement | null;
  searchInput?: HTMLInputElement | null;
  tagList?: HTMLElement | null;
  visibilitySelect?: HTMLSelectElement | null;
}

export interface HomeSectionController {
  [method: string]: unknown;
  activateFilter(filter: MemoListFilter | string): void;
  activateMemo(
    memoId: MemoID | string,
    options?: {
      commentId?: string;
      notify?: boolean;
      reveal?: boolean;
      scroll?: boolean;
    },
  ): boolean;
  activateTag(tag: string): void;
  activateView(section: HomeSection): void;
  clearActiveMemo(): boolean;
  createProject(): void;
  destroy(): void;
  loadMoreMemos(): boolean;
  memoCardViewModel(memoId: MemoID | string): MemoCardViewModel | null;
  showSettings(): void;
}

export interface HomeWorkspaceModelInstance {
  methods: {
    activate(section: HomeSection): void;
    activateFilter(filter: MemoListFilter | string): void;
    activateMemo(
      memoId: MemoID | string,
      options?: {
        commentId?: string;
        notify?: boolean;
        reveal?: boolean;
        scroll?: boolean;
      },
    ): boolean;
    activateTag(tag: string): void;
    clearActiveMemo(): boolean;
    register(
      section: HomeSection,
      controller: HomeSectionController,
    ): () => void;
    run(section: HomeSection, method: string, ...args: unknown[]): boolean;
    syncSidebarSelection(selection: {
      activeFilter?: string;
      activeProjectId?: string;
      activeTag?: string;
    }): void;
  };
  sidebar: {
    activeProjectId: ReactiveRef<string>;
    allNavCount: ReactiveRef<string>;
    boardNavCount: ReactiveRef<string>;
    chatNavCount: ReactiveRef<string>;
    clipboardNavCount: ReactiveRef<string>;
    codeNavCount: ReactiveRef<string>;
    fileNavCount: ReactiveRef<string>;
    imageNavCount: ReactiveRef<string>;
    linkNavCount: ReactiveRef<string>;
    milestoneNavCount: ReactiveRef<string>;
    projects: ReactiveRef<Array<{
      color: string;
      count: number;
      id: string;
      name: string;
    }>>;
    rulesNavCount: ReactiveRef<string>;
    tags: ReactiveRef<Array<{ count: number; tag: string }>>;
    tagSummary: ReactiveRef<string>;
    todoNavCount: ReactiveRef<string>;
  };
  state: {
    activeFilter: ReactiveRef<string>;
    activeSection: ReactiveRef<HomeSection>;
    activeTag: ReactiveRef<string>;
  };
}
