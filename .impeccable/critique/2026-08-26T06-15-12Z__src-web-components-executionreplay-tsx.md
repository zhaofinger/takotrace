---
target: 当前 ThreadScope Execution Replay 时间轴与并行可视化
total_score: 20
p0_count: 0
p1_count: 3
timestamp: 2026-08-26T06-15-12Z
slug: src-web-components-executionreplay-tsx
---
# ThreadScope Execution Replay 设计评审

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 2 | 能看到状态与失败数，但时间轴没有刻度、总时长或 observed/inferred 区分。 |
| 2 | Match System / Real World | 2 | “Actual time” 会把推断时间也画成真实时间，并让长调用吞掉短事件。 |
| 3 | User Control and Freedom | 3 | 可切换密度、时间模式和展开详情，但选中态缺少清除路径。 |
| 4 | Consistency and Standards | 2 | 顶层四泳道与 Execution 内批次瀑布使用两套不同的时间语义。 |
| 5 | Error Prevention | 2 | 失败状态明确，但用户很容易把推断时间与真实并行误读为同一事实。 |
| 6 | Recognition Rather Than Recall | 2 | 泳道有名称，但颜色、条纹、点状短事件都依赖悬停或记忆。 |
| 7 | Flexibility and Efficiency | 3 | Key/All 与 Actual/Logical 对专家有用，点击总览可跳到事件。 |
| 8 | Aesthetic and Minimalist Design | 2 | 风格克制，但空泳道、四个同权控件和重复时间图增加噪声。 |
| 9 | Error Recovery | 2 | 能定位失败批次，具体失败原因仍需继续展开。 |
| 10 | Help and Documentation | 0 | 没有刻度、图例或对“Actual / Logical / Timing inferred”的就地解释。 |
| **Total** |  | **20/40** | **Acceptable，需先修正信息模型** |

## Anti-Patterns Verdict

**LLM assessment**：不是典型的 AI 拼贴风格；配色与密度基本克制。问题更像“为了加入时间轴而加入时间轴”：顶层四泳道与下方批次瀑布没有形成单一叙事，组件存在，但用户仍无法快速回答“哪里并行、哪里最慢、Agent 在等什么”。

**Deterministic scan**：针对 `src/web/components/ExecutionReplay.tsx` 的 CLI 扫描为 0 项。浏览器运行时检测发现 4 个全局规则（2 个字体占比、1 个标题层级跳跃、1 个重复渐变）以及 23 个定位标记（4 个 positioned child clipped、18 个 cramped padding、1 个 line length too long）。字体占比与部分紧凑间距属于产品风格导致的误报；标题层级、泳道端点裁切与长行是真问题。重复渐变用于 inferred timing，功能上有含义，但缺少图例会让它看起来像装饰。

**Visual overlays**：注入成功并完成浏览器截图，但当前 Chrome 连接不提供 visibility capability，因此无法可靠地把带覆盖层的检测标签强制展示到前台。

## Overall Impression

最大的问题不是样式，而是抽象层级混了：顶部看起来像整个 Turn 的全局时间轴，下面又按 Execution 分批展示局部时间轴。两者既不共享刻度，也不共享并行语义。默认 Actual 模式下，实测 33 个总览事件里大量事件仅 4px 宽，一个长 MCP 调用达到 893px；Input、Agent 与多数 Tool 都挤在右端，信息几乎退化成一条橙线。

## What's Working

- Execution 分组、失败数和状态图标能让用户先扫异常，再决定是否展开。
- Key events / All events 的渐进披露符合高密度观察工具的使用方式。
- Execution 内已经有 Batch、耗时和推断时间条纹，说明底层数据足以支撑更清楚的并行表达。

## Priority Issues

### [P1] “Actual time” 在真实数据下退化

- **Why it matters**：零时长/缺失时间事件被压成 4px，长调用占满 90% 以上宽度；用户无法比较顺序，也无法发现 Agent 更新。
- **Fix**：默认使用混合尺度：位置按逻辑顺序，宽度或内层填充表达耗时；只有全部事件为 observed timing 时才开放严格比例的真实时间视图。补充 0、总时长与当前窗口刻度。
- **Suggested command**：`$impeccable layout`

### [P1] 顶层总览没有真正表达并行

- **Why it matters**：当前只是在泳道内堆叠重叠条，缺少 fork、join、并行批次边界和等待关系。Logical order 模式把全部条均匀铺开后，并行关系完全消失。
- **Fix**：并行只在 Execution/Batch 层展示：同一批次使用共享起止刻度与多行 action，标题明确 `Parallel ×N`，必要时加 fork/join bracket。顶部只保留一条紧凑 activity ruler，负责导航，不承担因果关系。
- **Suggested command**：`$impeccable layout`

### [P1] 总览与局部瀑布是两套竞争的信息架构

- **Why it matters**：用户必须猜“上面的 Tools 条”和“下面的 Batch 条”是否对应同一尺度；这增加认知负担且占用约 108px sticky 高度。
- **Fix**：确定唯一主模型。推荐 Turn 顶部为一条可缩放导航尺；Execution 展开后才出现精确瀑布。若坚持四泳道，则将其升级为 Turn-level 专用视图并移除重复的局部时间条。
- **Suggested command**：`$impeccable distill`

### [P2] 语义与视觉编码缺少解释

- **Why it matters**：橙色同时承担 MCP 类型、强调与长耗时；斜纹代表 inferred timing，但界面没有图例。“Actual time”因此显得比数据本身更精确。
- **Fix**：颜色只表达状态或主体之一；推断时间用明确标签或虚线边框，并把模式改名为 `Timeline` / `Sequence`，在 Timeline 旁显示 `Observed` 或 `Estimated`。
- **Suggested command**：`$impeccable clarify`

### [P2] 空泳道和选择反馈浪费空间

- **Why it matters**：无 Subagent 时仍固定占一行；点击总览后整行蓝框更像键盘 focus，而不是持续选择。
- **Fix**：隐藏空泳道；选择使用左侧标记和轻微背景色，焦点环只保留给键盘 focus。
- **Suggested command**：`$impeccable polish`

## Persona Red Flags

**Alex（Power User）**：能快速切换模式，但无法从顶层判断真正的并行批次；在 Actual 与 Logical 间来回切换仍要展开 Batch 才能获得答案，属于重复操作。

**Sam（Accessibility）**：4px 时间条虽是 button，但视觉目标过小；颜色与条纹承载的含义没有文本图例。页面还存在 `h1` 后直接进入 `h3` 的标题层级跳跃。

**Agent 工作流设计师**：核心任务是定位等待、并行和瓶颈。当前最长条只说明“它占了很久”，却没有说明 Agent 是否在等待它、是否与其他调用并行、何处 join，容易得到错误因果结论。

## Minor Observations

- 实测总览 108px 高，其中空 Subagents 泳道仍占 24px。
- Logical order 下所有条约 21.8px 等宽，可读顺序但完全丢失耗时。
- 顶部 Key/All 与 Actual/Logical 两组控件视觉同权，但一个控制事件密度，一个控制时间语义，应分层。
- 运行时检测标出了泳道末端的 positioned child clipping，当前大量 4px 标记贴在容器最右侧。

## Questions to Consider

- 顶部总览的首要任务到底是“导航到事件”，还是“判断性能瓶颈”？它不应同时承担两者。
- 对 ThreadScope 来说，并行是否应该以 Batch/Fork-Join 为主，而不是以 User/Agent/Tools/Subagents 泳道为主？
- 当时间主要是 inferred 时，是否应该默认 Sequence，而把 Timeline 作为有可靠时间数据时才出现的增强模式？
