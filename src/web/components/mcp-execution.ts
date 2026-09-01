import { asRecord as record, nonEmptyText as text } from "../value-utils";

export type NodeReplExecutionKind = "browser" | "computer-use" | "javascript";
export type NodeReplExecutionSource = "metadata" | "code" | "fallback";

export interface NodeReplExecution {
  kind: NodeReplExecutionKind;
  label: "Browser" | "Computer Use" | "JavaScript";
  title?: string;
  displayTitle: string;
  source: NodeReplExecutionSource;
}

function execution(kind: NodeReplExecutionKind, title: string | undefined, source: NodeReplExecutionSource): NodeReplExecution {
  const label = kind === "browser" ? "Browser" : kind === "computer-use" ? "Computer Use" : "JavaScript";
  return {
    kind,
    label,
    title,
    displayTitle: title ? `${label} · ${title}` : label,
    source,
  };
}

const BROWSER_CODE = /(?:setupBrowserRuntime|browser-client\.mjs|\bagent\.browsers\b|\b(?:browser|chrome)\.(?:tabs|capabilities|user)\b|\.playwright\.|\.ax\.|\.cua\.|\.dom_cua\.)/;
const COMPUTER_USE_CODE = /(?:@oai\/sky|\bsky\.(?:click|drag|get_app_state|list_apps|paste|perform_secondary_action|press_key|scroll|select_text|set_value|type_text)\b)/;

export function nodeReplExecution(rawValue: unknown): NodeReplExecution | undefined {
  const raw = record(rawValue);
  if (text(raw.server)?.toLowerCase() !== "node_repl" || text(raw.tool)?.toLowerCase() !== "js") return undefined;

  const args = record(raw.arguments);
  const title = text(args.title);
  const code = text(args.code) ?? text(args.function) ?? "";
  const resultMeta = record(record(raw.result)._meta);
  const surfaceKind = text(record(resultMeta["codex/toolSurface"]).kind)?.toLowerCase();

  if (surfaceKind === "browseruse") return execution("browser", title, "metadata");
  if (surfaceKind === "computeruse") return execution("computer-use", title, "metadata");
  if (COMPUTER_USE_CODE.test(code)) return execution("computer-use", title, "code");
  if (BROWSER_CODE.test(code)) return execution("browser", title, "code");
  return execution("javascript", title, "fallback");
}
