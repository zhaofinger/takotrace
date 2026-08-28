import { describe, expect, it } from "vitest";
import type { FlowEvent } from "../../src/web/components/InteractionFlow";
import {
  SEQUENCE_PARTICIPANTS,
  buildSequenceDiagramModel,
  compactShellCommand,
  exportMermaidSequence,
} from "../../src/web/components/sequence-diagram-model";

function createEvent(type: string, raw: unknown, overrides: Partial<FlowEvent> = {}): FlowEvent {
  return {
    seq: 1,
    at: "2026-01-01T00:00:00.000Z",
    method: "item/completed",
    type,
    status: "completed",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-1",
    summary: "item completed",
    raw,
    ...overrides,
  };
}

describe("sequence-diagram-model", () => {
  const sampleItems: FlowEvent[] = [
    createEvent("userMessage", { content: [{ type: "text", text: "Hello agent" }] }, {
      seq: 1,
      itemId: "item-1",
      at: "2026-01-01T00:00:00.000Z",
    }),
    createEvent("reasoning", { summary: ["Thinking about the reply"] }, {
      seq: 2,
      itemId: "item-2",
      at: "2026-01-01T00:00:01.000Z",
      durationMs: 450,
    }),
    createEvent("commandExecution", { command: "ls -la" }, {
      seq: 3,
      itemId: "item-3",
      at: "2026-01-01T00:00:02.000Z",
      durationMs: 120,
    }),
    createEvent("agentMessage", { text: "Here is the list", phase: "final_answer" }, {
      seq: 4,
      itemId: "item-4",
      at: "2026-01-01T00:00:03.000Z",
    }),
  ];

  it("uses distinct participant icons without repurposing shared disclosure icons", () => {
    expect(Object.values(SEQUENCE_PARTICIPANTS).map((participant) => participant.iconName)).toEqual([
      "user",
      "agent",
      "code",
      "terminal",
      "network",
      "subagent",
    ]);
  });

  it("builds correct participants and steps for all density", () => {
    const model = buildSequenceDiagramModel(sampleItems, "all");
    expect(model.participants.map((p) => p.key)).toEqual(["user", "agent", "tool"]);
    expect(model.steps).toHaveLength(4);
    expect(model.totalSteps).toBe(4);
    expect(model.visibleSteps).toBe(4);

    // Step 1: User -> Agent
    expect(model.steps[0].from).toBe("user");
    expect(model.steps[0].to).toBe("agent");
    expect(model.steps[0].type).toBe("call");

    // Step 2: Agent -> Agent (Reasoning self loop)
    expect(model.steps[1].from).toBe("agent");
    expect(model.steps[1].to).toBe("agent");
    expect(model.steps[1].type).toBe("self");

    // Step 3: Agent -> Tool
    expect(model.steps[2].from).toBe("agent");
    expect(model.steps[2].to).toBe("tool");
    expect(model.steps[2].type).toBe("call");

    // Step 4: Agent -> User (Final answer return)
    expect(model.steps[3].from).toBe("agent");
    expect(model.steps[3].to).toBe("user");
    expect(model.steps[3].type).toBe("return");
  });

  it("filters non-key steps (like reasoning) when density is key", () => {
    const model = buildSequenceDiagramModel(sampleItems, "key");
    expect(model.steps).toHaveLength(3);
    expect(model.steps.some((s) => s.type === "self")).toBe(false);
  });

  it("exports valid Mermaid.js sequence syntax", () => {
    const model = buildSequenceDiagramModel(sampleItems, "all");
    const mermaid = exportMermaidSequence(model);

    expect(mermaid).toContain("sequenceDiagram");
    expect(mermaid).toContain("autonumber");
    expect(mermaid).toContain("participant user as User");
    expect(mermaid).toContain("participant agent as Agent");
    expect(mermaid).toContain("participant tool as Tools");
    expect(mermaid).toContain("user->>+agent:");
    expect(mermaid).toContain("agent->>agent:");
    expect(mermaid).toContain("agent-->>user:");
  });

  it("renders lifecycle overlap as a parallel sequence region and Mermaid par block", () => {
    const items = [
      lifecycleEvent(1, "item/started", "first", "running"),
      lifecycleEvent(2, "item/started", "second", "running"),
      lifecycleEvent(3, "item/completed", "second", "completed"),
      lifecycleEvent(4, "item/completed", "first", "completed"),
    ];
    const model = buildSequenceDiagramModel(items);

    expect(model.parallelGroups).toEqual([
      expect.objectContaining({
        stepIds: ["seq-item-first", "seq-item-second"],
        maxConcurrency: 2,
        evidence: "lifecycle",
        label: "Parallel ×2",
      }),
    ]);
    expect(exportMermaidSequence(model)).toContain("par Parallel ×2");
    expect(exportMermaidSequence(model)).toContain("and Shell · second");
    expect(exportMermaidSequence(model)).toContain("  end");
  });

  it("keeps failed executions directed from the agent to the target lane", () => {
    const model = buildSequenceDiagramModel([
      createEvent("commandExecution", { command: "npm run build" }, { status: "failed" }),
    ]);

    expect(model.steps[0]).toMatchObject({
      from: "agent",
      to: "tool",
      type: "call",
      status: "failed",
    });
    expect(exportMermaidSequence(model)).toContain("agent->>+tool: Shell · npm run build");
  });

  it("uses the MCP server name for the sequence endpoint label", () => {
    const named = buildSequenceDiagramModel([
      createEvent("mcpToolCall", { server: "node_repl", tool: "js" }),
    ]);
    const unnamed = buildSequenceDiagramModel([
      createEvent("mcpToolCall", { tool: "js" }),
    ]);

    expect(named.steps[0]).toMatchObject({
      from: "agent",
      to: "mcp",
      toLabel: "node_repl",
      displayTitle: "JavaScript",
    });
    expect(unnamed.steps[0]).toMatchObject({
      from: "agent",
      to: "mcp",
    });
    expect(unnamed.steps[0].toLabel).toBeUndefined();
  });

  it("renders inferred SKILL.md reads in the Skills lane", () => {
    const model = buildSequenceDiagramModel([
      createEvent("commandExecution", {
        command: ["/bin/zsh", "-lc", "cat /Users/bytedance/.agents/skills/read/SKILL.md"],
        parsed_cmd: [{ type: "read", path: "/Users/bytedance/.agents/skills/read/SKILL.md" }],
      }),
    ]);

    expect(model.steps[0]).toMatchObject({
      from: "agent",
      to: "skill",
      displayTitle: "Skill load · read (inferred)",
      detailTitle: "Skill load · read (inferred)",
      isCommand: false,
    });
    expect(model.participants.map((participant) => participant.key)).toEqual(["user", "agent", "skill"]);
    expect(exportMermaidSequence(model)).toContain("agent->>+skill: Skill load · read (inferred)");
  });

  it("shows the subagent collaboration as outbound calls and inbound updates", () => {
    const items = [
      createEvent("subAgentActivity", {
        kind: "started",
        agent_path: "/root/frontend_impl",
        agent_thread_id: "thread-2",
      }, { seq: 1, itemId: "sub-1" }),
      createEvent("collabAgentToolCall", {
        tool: "send_input",
        prompt: "Verify the UI",
        receiver_agents: [{ agent_nickname: "frontend_impl" }],
      }, { seq: 2, itemId: "sub-2" }),
      createEvent("subAgentActivity", {
        kind: "interacted",
        agent_path: "/root/frontend_impl",
        agent_thread_id: "thread-2",
      }, { seq: 3, itemId: "sub-3" }),
      createEvent("collabAgentToolCall", { tool: "wait" }, { seq: 4, itemId: "sub-4" }),
      createEvent("subAgentActivity", {
        kind: "completed",
        agent_path: "/root/frontend_impl",
        agent_thread_id: "thread-2",
      }, { seq: 5, itemId: "sub-5" }),
    ];
    const model = buildSequenceDiagramModel(items);

    expect(model.participants.filter((participant) => participant.key === "subagent")).toHaveLength(1);
    expect(model.steps.map(({ from, to, type, displayTitle }) => ({ from, to, type, displayTitle }))).toEqual([
      { from: "agent", to: "subagent", type: "call", displayTitle: "Started · frontend_impl" },
      { from: "agent", to: "subagent", type: "call", displayTitle: "Message · frontend_impl" },
      { from: "subagent", to: "agent", type: "return", displayTitle: "Update · frontend_impl" },
      { from: "agent", to: "subagent", type: "call", displayTitle: "Join subagents" },
      { from: "subagent", to: "agent", type: "return", displayTitle: "Result · frontend_impl" },
    ]);
    expect(exportMermaidSequence(model)).toContain("agent->>+subagent: Started · frontend_impl");
    expect(exportMermaidSequence(model)).toContain("subagent-->>agent: Result · frontend_impl");
  });

  it("removes nested shell wrappers from command display titles", () => {
    expect(compactShellCommand("/bin/zsh -lc 'node /Users/bytedance/workspace/thread-scope/script.mjs'"))
      .toBe("node …/script.mjs");
    expect(compactShellCommand('/bin/zsh -lc "zsh -lc \\"git status && git log -1\\""'))
      .toBe("git status && git log -1");
    expect(compactShellCommand(
      "/bin/zsh -lc 'sed -n \"1,120p\" /Users/bytedance/workspace/thread-scope/src/web/App.tsx'",
      "/Users/bytedance/workspace/thread-scope",
    )).toBe('sed -n "1,120p" ./src/web/App.tsx');
  });

  it("keeps the node runtime and entry filename while collapsing its directories", () => {
    expect(compactShellCommand(
      "/bin/zsh -lc 'node /Users/bytedance/.agents/skills/impeccable/scripts/context.mjs'",
    )).toBe("node …/context.mjs");
    expect(compactShellCommand('node "./scripts/context.mjs" --json'))
      .toBe('node "…/context.mjs" --json');
    expect(compactShellCommand("node context.mjs")).toBe("node context.mjs");
  });

  it("keeps cat and the filename while collapsing long file paths", () => {
    expect(compactShellCommand(
      "/bin/zsh -lc 'cat /Users/bytedance/.agents/skills/impeccable/reference/polish.md'",
    )).toBe("cat …/polish.md");
    expect(compactShellCommand('cat "./references/polish.md"'))
      .toBe('cat "…/polish.md"');
    expect(compactShellCommand("cat ./README.md")).toBe("cat ./README.md");
  });

  it("keeps full command detail while Mermaid uses the compact title", () => {
    const command = '/bin/zsh -lc "zsh -lc \\"rg -n sequence src/web\\""';
    const model = buildSequenceDiagramModel([
      createEvent("commandExecution", { command }),
    ]);

    expect(model.steps[0].displayTitle).toBe("Shell · rg -n sequence src/web");
    expect(model.steps[0].detailTitle).toBe("Shell · rg -n sequence src/web");
    expect(model.steps[0].detail).toBe(command);
    expect(exportMermaidSequence(model)).toContain("agent->>+tool: Shell · rg -n sequence src/web");
    expect(exportMermaidSequence(model)).not.toContain("/bin/zsh -lc");
  });

  it("keeps full paths in detail titles while compacting diagram labels", () => {
    const command = "/bin/zsh -lc 'cat /Users/bytedance/.agents/skills/impeccable/reference/polish.md'";
    const model = buildSequenceDiagramModel([
      createEvent("commandExecution", { command }),
    ]);

    expect(model.steps[0].displayTitle).toBe("Shell · cat …/polish.md");
    expect(model.steps[0].detailTitle)
      .toBe("Shell · cat /Users/bytedance/.agents/skills/impeccable/reference/polish.md");
    expect(model.steps[0].detail).toBe(command);
  });

  it("does not unwrap malformed shell arguments or replace cwd prefixes", () => {
    expect(compactShellCommand("zsh -lc 'git status' extra"))
      .toBe("zsh -lc 'git status' extra");
    expect(compactShellCommand(
      "sed -n 1p /Users/bytedance/workspace/thread-scope-old/file.ts",
      "/Users/bytedance/workspace/thread-scope",
    )).toBe("sed -n 1p ~/workspace/thread-scope-old/file.ts");
  });
});

function lifecycleEvent(
  seq: number,
  method: string,
  itemId: string,
  status: FlowEvent["status"],
): FlowEvent {
  return createEvent("commandExecution", { command: itemId }, {
    seq,
    at: "2026-01-01T00:00:00.000Z",
    method,
    itemId,
    status,
  });
}
