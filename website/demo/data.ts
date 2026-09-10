import type {
  CompactTurn,
  SessionProvider,
  SubagentDetail,
  Thread,
  TraceEvent,
  Turn,
} from "../../src/web/types";

const english =
  typeof window === "undefined" ||
  new URLSearchParams(window.location.search).get("lang") === "en";
const text = (zh: string, en: string) => (english ? en : zh);
const start = Date.parse("2026-09-10T06:00:00.000Z");
const at = (offset: number) => new Date(start + offset).toISOString();
const usage = {
  totalTokens: 12480,
  inputTokens: 10800,
  cachedInputTokens: 6400,
  cacheWriteInputTokens: 0,
  outputTokens: 1680,
  reasoningOutputTokens: 480,
};

type Step = {
  type: string;
  summary: string;
  raw: Record<string, unknown>;
  durationMs?: number;
};
function run(
  threadId: string,
  id: string,
  provider: SessionProvider,
  steps: Step[],
): Turn & CompactTurn {
  let offset = 0;
  const items: TraceEvent[] = steps.map((step, index) => {
    const durationMs = step.durationMs ?? 800;
    const startedAt = at(offset);
    offset += durationMs;
    return {
      ...step,
      seq: index + 1,
      itemId: `${id}-step-${index + 1}`,
      threadId,
      turnId: id,
      method: "item/completed",
      status: "completed",
      provider,
      startedAt,
      completedAt: at(offset),
      at: startedAt,
      durationMs,
    };
  });
  return {
    id,
    status: "completed",
    startedAt: at(0),
    completedAt: at(offset),
    durationMs: offset,
    model: provider === "codex" ? "gpt-5.4" : "claude-sonnet-4-6",
    summary: steps[0].summary,
    itemCount: items.length,
    items,
    tokenUsage: usage,
    context: {
      source: provider === "codex" ? "rollout-file" : "claude-history",
      session: { cwd: "/demo/notes-app", provider, demo: true },
      worldState: {
        instructions:
          "Use semantic HTML. Keep changes focused. Verify keyboard navigation.",
      },
      turn: {
        model: provider === "codex" ? "gpt-5.4" : "claude-sonnet-4-6",
        approval_policy: "on-request",
        sandbox_policy: "workspace-write",
      },
    },
  };
}
const user = (message: string): Step => ({
  type: "userMessage",
  summary: message,
  raw: { content: [{ type: "text", text: message }] },
});
const reasoning = (message: string): Step => ({
  type: "reasoning",
  summary: message,
  raw: { summary: [message] },
  durationMs: 1400,
});
const command = (cmd: string, output: string, durationMs = 900): Step => ({
  type: "commandExecution",
  summary: cmd,
  raw: {
    command: cmd,
    aggregatedOutput: output,
    exitCode: 0,
    status: "completed",
  },
  durationMs,
});
const reply = (message: string): Step => ({
  type: "agentMessage",
  summary: message,
  raw: { text: message, phase: "final_answer" },
});

const search = run("demo-search", "demo-search-run", "codex", [
  user(text("给笔记列表加一个搜索框", "Add search to the notes list")),
  reasoning(
    text(
      "先查看列表组件，再补上关键词过滤。",
      "Check the list component, then add keyword filtering.",
    ),
  ),
  command(
    "cat src/NotesList.tsx",
    "export function NotesList({ notes }) {\n  return <ul>{notes.map(note => <li key={note.id}>{note.title}</li>)}</ul>;\n}",
  ),
  {
    type: "fileChange",
    summary: "src/NotesList.tsx",
    raw: {
      changes: [
        {
          path: "src/NotesList.tsx",
          kind: "update",
          diff: '+ const [query, setQuery] = useState("");\n+ const filtered = notes.filter(note =>\n+   note.title.toLowerCase().includes(query.toLowerCase())\n+ );\n+ <input aria-label="Search notes" value={query}\n+   onChange={event => setQuery(event.target.value)} />',
        },
      ],
    },
    durationMs: 1800,
  },
  command(
    "npm test -- NotesList",
    "PASS NotesList\n✓ filters by title\n✓ ignores letter case\n✓ shows all notes for an empty query\n3 tests passed",
    2200,
  ),
  reply(
    text(
      "已添加搜索框，支持按标题过滤和大小写忽略。3 项测试通过。",
      "Added title search with case-insensitive matching. All 3 tests passed.",
    ),
  ),
]);
const keyboard = run("demo-search", "demo-keyboard-run", "codex", [
  user(text("再检查键盘操作", "Check keyboard navigation")),
  command(
    "npm test -- keyboard",
    "PASS keyboard navigation\n✓ Tab focuses the search input\n✓ Escape clears the query\n2 tests passed",
    1400,
  ),
  reply(
    text(
      "Tab 可以聚焦搜索框，Escape 清空关键词。两项测试通过。",
      "Tab focuses the search input; Escape clears the query. Both tests passed.",
    ),
  ),
]);
const review = run("demo-review", "demo-review-run", "codex", [
  user(text("检查搜索功能的边界情况", "Review search edge cases")),
  reasoning(
    text(
      "委派一个子任务检查空输入和特殊字符。",
      "Ask a subagent to check empty input and special characters.",
    ),
  ),
  {
    type: "subAgentActivity",
    summary: "Started · search_reviewer",
    raw: {
      kind: "started",
      agent_path: "/root/search_reviewer",
      agent_thread_id: "demo-worker",
      message: text(
        "检查空输入和特殊字符",
        "Check empty input and special characters",
      ),
    },
  },
  command(
    "git diff --stat",
    "src/NotesList.tsx | 12 +++++++++++-\n1 file changed",
    200,
  ),
  {
    type: "subAgentActivity",
    summary: "Completed · search_reviewer",
    raw: {
      kind: "completed",
      agent_path: "/root/search_reviewer",
      agent_thread_id: "demo-worker",
      message: text(
        "空输入和特殊字符均通过测试。",
        "Empty input and special characters passed.",
      ),
    },
    durationMs: 2200,
  },
  reply(
    text(
      "检查完成，没有发现需要修改的问题。",
      "Review complete. No changes needed.",
    ),
  ),
]);
const docs = run("demo-docs", "demo-docs-run", "claude", [
  user(text("给搜索组件补一段使用说明", "Document the search component")),
  reasoning(
    text(
      "查看组件接口和现有文档格式。",
      "Read the component interface and existing documentation.",
    ),
  ),
  command(
    "cat src/NotesList.tsx",
    "export function NotesList({ notes }: { notes: Note[] }) { /* ... */ }",
  ),
  {
    type: "fileChange",
    summary: "docs/search.md",
    raw: {
      changes: [
        {
          path: "docs/search.md",
          kind: "add",
          diff: "+ # Search notes\n+ Type a title in the search field. Matching ignores letter case.\n+ Clear the field to show all notes. Press Escape to clear it.",
        },
      ],
    },
  },
  reply(
    text(
      "已补充用法和键盘操作说明。",
      "Added usage and keyboard instructions.",
    ),
  ),
]);
const worker = run("demo-worker", "demo-worker-run", "codex", [
  user(
    text("检查空输入和特殊字符", "Check empty input and special characters"),
  ),
  command(
    "npm test -- search-edge-cases",
    "✓ empty query returns all notes\n✓ punctuation is treated as plain text\n2 tests passed",
    1400,
  ),
  reply(text("两项边界测试通过。", "Both edge-case tests passed.")),
]);
function thread(
  id: string,
  title: string,
  provider: SessionProvider,
  turns: Array<Turn & CompactTurn>,
): Omit<Thread, "turns"> & { turns: Array<Turn & CompactTurn> } {
  return {
    id,
    title,
    provider,
    cwd: "/demo/notes-app",
    status: "completed",
    turnsLoaded: true,
    createdAt: at(0),
    updatedAt: at(60000),
    turns,
    tokenUsage: { total: usage, last: usage, modelContextWindow: 200000 },
  };
}
export const threads = [
  thread("demo-search", text("笔记搜索", "Search notes"), "codex", [
    search,
    keyboard,
  ]),
  thread("demo-review", text("检查边界情况", "Review edge cases"), "codex", [
    review,
  ]),
  thread("demo-docs", text("编写使用说明", "Write documentation"), "claude", [
    docs,
  ]),
];
export const workerDetail: SubagentDetail = {
  thread: {
    ...thread("demo-worker", "search_reviewer", "codex", [worker]),
    parentThreadId: "demo-review",
    agentNickname: "search_reviewer",
    agentPath: "/root/search_reviewer",
    turns: [worker],
  },
  assignment: {
    availability: "available",
    text: text(
      "检查空输入和特殊字符，不修改组件。",
      "Check empty input and special characters without changing the component.",
    ),
    taskName: "search_reviewer",
    source: "demo",
  },
};
