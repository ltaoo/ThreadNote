# ThreadNote 设计规范

## 1. 设计方向

ThreadNote 是本地优先的知识与任务工作台。视觉语言来自三个产品隐喻：可长期阅读的纸张、清晰可靠的墨迹、用于标记重要内容的琥珀色印记。

- **世界（World）**：桌面笔记工作台，而非营销网站或通用管理后台。
- **材质（Materials）**：暖纸、炭墨、琥珀色荧光标记；界面应有纸张的温度，但保持数字工具的精确度。
- **配色（Palette）**：logo 原色纸张白 `#F7F5EF`、炭黑 `#202124`、琥珀黄 `#FFAE24` 是品牌锚点；蓝、绿、橙、红只承担信息状态。
- **签名元素（Signature）**：`amber mark`。使用克制的琥珀色面、圆点或短标签表达选中、置顶与当前状态，不使用贯穿内容的装饰线。

界面整体应安静、紧凑、耐看。大胆的部分只留给 amber mark 和关键行动，其余区域依靠排版、间距与层级工作。

## 2. Token 架构

唯一 token 源是 [`src/style.css`](./src/style.css)，统一使用 `--tn-` 前缀。

```text
logo 原色 / 原始尺度
        ↓
语义 token（--tn-color-bg-* / --tn-space-* / --tn-radius-*）
        ↓
原子类（tn-*）或组件 token
        ↓
组件与页面样式
        ↓
旧变量兼容别名（仅迁移期）
```

规则：

1. 页面和新组件只允许消费 `tn-*` 原子类或语义 token，不直接写品牌 hex，也不使用 `--BG-0`、`--FG-1`、`--memo-accent` 等旧变量。
2. 原始品牌色只负责建立语义映射。组件使用 `--tn-color-primary-*`，不直接使用 `--tn-color-brand-amber`。
3. light/dark 主题只覆写语义色；字号、间距、圆角和布局尺度保持稳定。
4. 旧变量别名用于保证 `public/index.css` 在渐进迁移期间可运行，完成组件迁移后删除。

## 3. 色彩

### 品牌与主色

| 角色 | Token | Light | 用法 |
| --- | --- | --- | --- |
| 纸张 | `--tn-color-brand-paper` | `#F7F5EF` | 应用画布、logo 背景 |
| 墨色 | `--tn-color-brand-ink` | `#202124` | 主文本、琥珀底上的内容 |
| 琥珀 | `--tn-color-brand-amber` | `#FFAE24` | 品牌锚点，不直接供组件使用 |
| 主色填充 | `--tn-color-primary-fill` | `#FFAE24` | 主按钮、选中指示、amber mark |
| 主色文字 | `--tn-color-primary-text` | `#875000` | 浅色背景上的链接和强调文字 |
| 主色柔和底 | `--tn-color-primary-soft` | `#FFF0C7` | 选中行、标签、搜索命中 |

琥珀底必须配炭黑 `--tn-color-on-primary`，不可配白字。浅色背景上的小号琥珀文字必须使用加深后的 `--tn-color-primary-text`。这是品牌辨识度与可读性的共同约束。

### 表面层级

- `canvas`：应用最底层，使用 logo 的暖纸色。
- `surface`：主要工作区与卡片。
- `subtle`：侧栏、分组区、次级控件。
- `interactive`：hover、pressed、输入区等明确交互表面。
- `elevated`：浮层、菜单和对话框；只在确实脱离文档流时配合阴影。

### 状态色

- `success` 只表示完成、同步成功或健康状态。
- `warning` 只表示需要留意但仍可继续的状态。
- `danger` 只表示失败、破坏性操作或不可恢复风险。
- `info` 用于信息提示与编辑器选区，不与主行动争夺注意力。

状态必须同时使用文字、图标或形状传达，不得只靠颜色。

## 4. 排版

- **Display**：`--tn-font-family-display`，用于页面标题、空状态主句和关键数字；字重以 600 为上限，避免界面变得厚重。
- **Body**：`--tn-font-family-body`，用于正文、控件和导航，是默认字体。
- **Mono**：`--tn-font-family-mono`，只用于 Markdown 源码、代码、快捷键、时间戳和技术标识。

默认根字号为 14px。正文行高使用 `--tn-line-height-body`（1.55），长篇 Memo 使用 `--tn-line-height-reading`（1.7）。标题使用紧凑行高，元数据可以使用 12–13px，但交互控件文字不应小于 12px。

## 5. 间距、形状与密度

- 间距采用 4px 基准网格，2px 半步只用于图标微调或紧凑控件内部。
- 常规控件高度 36px，紧凑工具栏可使用 30px；独立点击目标不得小于 44px。
- 常规组件圆角 5–8px，浮层 12px，整圆只用于头像、状态点和 pill。
- 工作台以“侧栏 / 主工作区 / 检查器”三栏为基准：

```text
┌──────────────┬──────────────────────────┬──────────────────┐
│ navigation   │ memo / task workspace    │ context inspector│
│ 172–220px    │ minmax(0, 1fr)           │ 220–300px        │
└──────────────┴──────────────────────────┴──────────────────┘
```

不使用连续的大圆角卡片包裹所有内容。优先用背景层级、分组间距和排版对比建立结构；1px 边框只用于组件边界与焦点反馈，不承担装饰性连接关系。

## 6. Amber mark 与连接关系

Amber mark 是 ThreadNote 的唯一签名元素，使用 `--tn-color-primary-*` 语义 tokens 构成小面积的状态面、圆点或短标签。

- Memo 列表中的卡片必须是独立纸页，不在左侧绘制轨迹线或节点。
- 评论必须是完整的批注卡片，不使用竖线、横线、箭头或伪元素与 Memo/其他评论相连。
- 置顶、选中、今天等状态使用柔和底色、标签或小面积 amber mark 表达。
- `--tn-thread-*` 仅作为旧样式兼容 token；新的普通卡片和评论不得消费它们。

只有数据本身就是有明确先后顺序的时间线或流程图时，才允许绘制连接线。连接线必须帮助理解顺序，不能仅用于制造品牌感。

## 7. 阴影与动效

- 默认层级依赖边框和表面色，`shadow-sm` 只用于轻微悬浮。
- `shadow-md` 及以上仅用于菜单、popover、dialog、toast 等脱离文档流的对象。
- hover/pressed 使用 120–180ms；布局变化与浮层进入可使用 260ms。
- 动效只说明状态变化，不持续吸引注意。系统开启 reduced motion 时，时长 token 自动归零。
- hover、focus 与 pressed 不得改变页面内元素的 `x/y/width/height`。边框和操作区必须预留尺寸，状态只改变颜色、阴影和透明度。
- `transform` 位移动效只允许用于脱离文档流的 popover、dialog 与 toast；Memo、评论、表单和其他内容组件不得在 hover 时平移或缩放。

## 8. 可访问性与实现约束

1. 所有键盘可操作元素必须保留清晰的 `:focus-visible`。
2. 正文与背景至少满足 WCAG AA；小号文本不直接使用 logo 琥珀色。
3. dark 主题不是简单反色：保留暖色相，并重新校准文字、边框、阴影和状态色。
4. 禁用态同时降低对比并取消交互，不只修改透明度。
5. 新组件如需专属 token，命名为 `--tn-<component>-<property>-<state>`，其值必须引用现有语义 token。

## 9. 原子类

原子类定义在 [`src/atomic.css`](./src/atomic.css)，统一使用 `tn-` 前缀，避免与现有 Tailwind 和旧页面类名冲突。

数字后缀对应 token 名而不是字面像素值。例如：

| 类名 | 实际声明 | 当前值 |
| --- | --- | --- |
| `tn-gap-0-5` | `gap: var(--tn-space-0-5)` | 2px |
| `tn-p-2` | `padding: var(--tn-space-2)` | 8px |
| `tn-mt-4` | `margin-top: var(--tn-space-4)` | 16px |
| `tn-rounded-md` | `border-radius: var(--tn-radius-md)` | 8px |

覆盖范围：

- 布局：`tn-flex`、`tn-grid`、对齐、伸缩、定位、溢出、宽高与层级。
- 间距：`tn-m*`、`tn-p*`、`tn-gap*`，覆盖全部 `--tn-space-*` 尺度。
- 场景间距：`tn-gap-text-icon`、`tn-gap-content`、`tn-gap-section`、`tn-gap-page`。
- 排版：字体角色、字号、行高、字重、字距、截断和数字格式。
- 外观：语义文字色、背景色、边框、圆角、阴影、透明度和 amber mark。
- 行为：光标、选区、pointer events、过渡和无障碍隐藏。

组合示例：

```js
View(
  {
    class: "tn-flex tn-items-center tn-gap-2 tn-p-3 tn-bg-surface tn-border tn-rounded-md",
  },
  children,
);
```

同一属性只使用一个原子类。兄弟元素间距优先使用父容器的 `tn-gap-*`，不使用依赖 DOM 顺序的 `space-x/space-y`。业务状态、复杂响应式规则和组件结构仍由组件类负责，不扩张为原子类。

## 10. 迁移顺序

1. 新建全局 `src/components.js`，只承载通用 UI 组件并消费 `tn-*` 原子类和 `--tn-*` 组件 token。
2. 页面通过 `src/index.js` 暴露的全局组件调用，不在页面内重复实现 UI 基元。
3. 逐模块把 `public/index.css` 中的硬编码颜色和旧变量替换为 `--tn-*`。
4. 旧样式清零后移除 legacy `@import` 与兼容别名，保留 `src/style.css` 作为 tokens、原子类和组件样式的统一入口。

## 11. UI 组件

组件入口是 [`src/components.js`](./src/components.js)，组件样式位于 [`src/components.css`](./src/components.css)。`src/index.js` 会把入口的全部导出注册为全局名称，因此页面保持与现有代码一致的函数调用形式。

组件类名统一采用“基础类 + 变体/尺寸类 + 状态类”的组合，不允许为同类控件另起一套完整视觉规则：

```html
<button class="tn-button tn-button--primary">保存</button>
<button class="tn-button tn-button--secondary tn-button--sm">取消</button>
<div class="tn-input-root tn-input-root--filled">
  <input class="tn-input tn-input--md tn-input--filled" />
</div>
<div class="tn-popup tn-popup--menu tn-menu tn-dropdown-menu"></div>
```

`tn-button`、`tn-input`、`tn-select`、`tn-date-picker`、`tn-popup`、`tn-menu`、`tn-dialog`、`tn-drawer`、`tn-tooltip` 分别持有各组件不随场景变化的基础视觉与交互规则；`--primary`、`--filled`、`--sm`、`--left` 等附加类只覆盖对应差异。`is-open`、`is-disabled`、`is-invalid` 等状态类只表达运行状态。`memo-*` 等业务类只能负责布局或保留迁移兼容，不再定义一套独立组件皮肤。

当前组件分为三组：

- 交互：`Button`、`IconButton`、`Dialog`、`Popover`。
- 表单：`Input`、`Textarea`、`Checkbox`、`Switch`、`Select`、`Label`、`FormField`。
- 展示：`Badge`、`Avatar`、`Card`、`Table`、`Alert`、`Progress`、`Spinner`、`Skeleton`、`Separator`、`EmptyState`。
- 业务复合组件：`MemoCard`、`SmallCalendar`。两者组合基础组件与 `tn-*` 原子类；Memo 展示状态由 `MemoCardModel` 维护，月份、选日、周起始日、日期数量和日历标记由 `SmallCalendarModel` 维护。

所有有状态组件都遵循 Model / View 分离：Model 持有状态和业务回调，组件 View 只订阅状态、渲染 DOM，并把用户事件转发给 Model 方法。新页面推荐显式创建 Model，便于跨组件协调和单元测试。

```js
const titleModel = createInputModel({
  defaultValue: "",
  onChange(value) {
    draftModel.rename(value);
  },
});

const dialogModel = createDialogModel({
  title: "新建 Memo",
  async onConfirm() {
    await draftModel.save();
  },
});

View({ class: "tn-grid tn-gap-4" }, [
  FormField(
    {
      label: "标题",
      description: "使用一个便于检索的短标题。",
    },
    [Input({ model: titleModel, placeholder: "例如：发布检查清单" })],
  ),
  Button({ model: createButtonModel({ onPress: () => dialogModel.show() }), variant: "primary" }, [
    "新建 Memo",
  ]),
  Dialog({ model: dialogModel }, ["确认保存当前内容？"]),
]);
```

组件仍接受 `store` 作为 `model` 的兼容别名，并支持当前 `Timeless.ui.*Core` 的 `state`、`onStateChange` 与常用行为方法，方便现有页面渐进迁移。组件专属状态使用 `is-*` 类，页面布局和局部覆盖优先组合 `tn-*` 原子类。

`MemoCard` 支持默认纯文本内容，也可以通过 `renderContent(memo, model)` 接入现有 Markdown View。卡片的置顶、归档、展开、选择、反应和异步错误均由 Model 管理：

```js
MemoCard({
  clickable: true,
  memo: {
    id: "memo-42",
    content: "# 发布计划\n完成回归后发布。 #release",
    createdAt: "2026-08-19T10:30:00+08:00",
    pinned: true,
  },
  async onPinChange(pinned, memo) {
    await memoRepository.setPinned(memo.id, pinned);
  },
  renderContent(memo) {
    return MemoMarkdownView({ content: memo.content });
  },
});
```
