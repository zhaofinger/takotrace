import type { TurnContextSnapshot } from "../types";
import { HighlightedCode } from "./HighlightedCode";

interface ContextEntry {
  key: string;
  label: string;
  value: unknown;
}

interface ContextSection {
  description: string;
  entries: ContextEntry[];
  title: string;
}

const sessionLabels: Array<[string, string]> = [
  ["base_instructions", "Base instructions"],
  ["context_window", "Context window"],
  ["history_mode", "History mode"],
];

const instructionLabels: Array<[string, string]> = [
  ["agents_md", "AGENTS.md"],
  ["managed_developer_instructions", "Managed developer instructions"],
  ["skills", "Skills"],
  ["host_skills", "Host skills"],
  ["orchestrator_skills", "Orchestrator skills"],
  ["context_window_guidance", "Context window guidance"],
  ["multi_agent_usage_hint", "Multi-agent guidance"],
  ["plugins", "Plugins"],
  ["agents", "Agents"],
];

const environmentLabels: Array<["session" | "worldState" | "turn", string, string]> = [
  ["turn", "cwd", "Working directory"],
  ["turn", "workspace_roots", "Workspace roots"],
  ["turn", "current_date", "Current date"],
  ["turn", "timezone", "Timezone"],
  ["turn", "model", "Model"],
  ["session", "cwd", "Working directory"],
  ["session", "git_branch", "Git branch"],
  ["session", "tag", "Session tag"],
  ["session", "claude_code_version", "Claude Code version"],
  ["session", "model", "Model"],
  ["worldState", "environments", "Environments"],
  ["session", "git", "Git"],
  ["session", "model_provider", "Model provider"],
  ["session", "cli_version", "CLI version"],
  ["session", "originator", "Originator"],
  ["session", "source", "Source"],
  ["session", "thread_source", "Thread source"],
];

const permissionLabels: Array<["worldState" | "turn", string, string]> = [
  ["turn", "approval_policy", "Approval policy"],
  ["turn", "approvals_reviewer", "Approvals reviewer"],
  ["turn", "sandbox_policy", "Sandbox policy"],
  ["turn", "permission_profile", "Permission profile"],
  ["turn", "active_permission_profile", "Active permission profile"],
  ["worldState", "permissions", "Permissions"],
  ["worldState", "permission_mode", "Permission mode"],
];

const runtimeLabels: Array<["session" | "worldState" | "turn", string, string]> = [
  ["turn", "effort", "Reasoning effort"],
  ["turn", "personality", "Personality"],
  ["turn", "collaboration_mode", "Collaboration mode"],
  ["turn", "multi_agent_version", "Multi-agent version"],
  ["turn", "realtime_active", "Realtime active"],
  ["worldState", "multi_agent_mode", "Multi-agent mode"],
  ["worldState", "persistent_mode", "Persistent mode"],
  ["worldState", "realtime", "Realtime"],
  ["worldState", "apps_instructions", "App instructions enabled"],
  ["worldState", "plugins_instructions", "Plugin instructions enabled"],
  ["worldState", "environments_instructions", "Environment instructions enabled"],
  ["session", "history_mode", "History mode"],
  ["worldState", "tools", "Tools"],
  ["worldState", "mcp_servers", "MCP servers"],
  ["worldState", "slash_commands", "Slash commands"],
  ["worldState", "terminal_slash_commands", "Terminal slash commands"],
  ["worldState", "output_style", "Output style"],
  ["worldState", "effort", "Effort"],
  ["worldState", "capabilities", "Capabilities"],
];

function entriesFrom(source: Record<string, unknown>, labels: Array<[string, string]>): ContextEntry[] {
  return labels.flatMap(([key, label]) => source[key] === undefined ? [] : [{ key, label, value: source[key] }]);
}

function entriesAcross(
  context: TurnContextSnapshot,
  labels: Array<["session" | "worldState" | "turn", string, string]>,
): ContextEntry[] {
  return labels.flatMap(([scope, key, label]) => context[scope][key] === undefined
    ? []
    : [{ key: `${scope}-${key}`, label, value: context[scope][key] }]);
}

export function contextSections(context: TurnContextSnapshot): ContextSection[] {
  return [
    {
      title: "Instructions",
      description: "Instructions and local project guidance recorded for this run.",
      entries: [
        ...entriesFrom(context.session, sessionLabels.slice(0, 1)),
        ...entriesFrom(context.worldState, instructionLabels),
      ],
    },
    {
      title: "Environment",
      description: "Workspace, model, Git, and process metadata.",
      entries: entriesAcross(context, environmentLabels),
    },
    {
      title: "Permissions",
      description: "Approval, sandbox, and filesystem access active for this run.",
      entries: entriesAcross(context, permissionLabels),
    },
    {
      title: "Runtime",
      description: "Agent behavior, collaboration, and session execution settings.",
      entries: [
        ...entriesAcross(context, runtimeLabels),
        ...entriesFrom(context.session, sessionLabels.slice(1, 2)),
      ],
    },
    {
      title: "Context management",
      description: "Context summarization settings recorded for this run.",
      entries: entriesFrom(context.turn, [
        ["summary", "Summary mode"],
        ["comp_hash", "Context hash"],
        ["compact_boundary", "Compact boundary"],
        ["context_usage", "Context usage"],
      ]),
    },
  ];
}

function serialized(value: unknown): { code: string; language: "json" | "plaintext" } {
  if (typeof value === "string") return { code: value, language: "plaintext" };
  return { code: JSON.stringify(value, null, 2) ?? String(value), language: "json" };
}

function sourceDetails(source: TurnContextSnapshot["source"]): { description: string; label: string } {
  if (source === "claude-live") {
    return { description: "Captured from the managed Claude session at the start of this run.", label: "Claude live" };
  }
  if (source === "claude-history") {
    return { description: "Reconstructed from locally available Claude session metadata.", label: "Claude history" };
  }
  return { description: "Captured from the local Codex rollout at the start of this run.", label: "Local rollout" };
}

export function ContextDetails({ context }: { context?: TurnContextSnapshot }) {
  if (!context) {
    return (
      <div className="vbg-custom-context-empty">
        <strong>No local context recorded</strong>
        <span>This provider or historical session did not expose a context snapshot for this run.</span>
      </div>
    );
  }
  const sections = contextSections(context);
  const source = sourceDetails(context.source);
  const hasEntries = sections.some((section) => section.entries.length > 0);
  if (!hasEntries) {
    return (
      <div className="vbg-custom-context-empty">
        <strong>Context snapshot is empty</strong>
        <span>The local rollout recorded the run, but no supported context fields were present.</span>
      </div>
    );
  }
  return (
    <div className="vbg-custom-context-view">
      <header className="vbg-custom-context-view__header">
        <div><strong>Run context</strong><span>{source.description}</span></div>
        <span className="vbg-custom-context-view__source">{source.label}</span>
      </header>
      {sections.map((section) => (
        <section className="vbg-custom-context-section" key={section.title}>
          <header><h3>{section.title}</h3><p>{section.description}</p></header>
          {section.entries.length ? (
            <dl>
              {section.entries.map((entry) => {
                const content = serialized(entry.value);
                return (
                  <div className="vbg-custom-context-field" key={entry.key}>
                    <dt>{entry.label}</dt>
                    <dd><HighlightedCode code={content.code} language={content.language} /></dd>
                  </div>
                );
              })}
            </dl>
          ) : <p className="vbg-custom-context-section__empty">Not recorded</p>}
        </section>
      ))}
    </div>
  );
}
