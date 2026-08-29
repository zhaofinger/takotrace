import type { CompactTraceEvent, ThreadDetail, TraceEvent } from "../types";
import { eventRaw, normalizedEventType, traceEventId } from "../trace-event";
import { asRecord as record, nonEmptyText as text, type UnknownRecord } from "../value-utils";
import { commandText, workingDirectoryText } from "./command-display";
import { HighlightedCode, languageForPath } from "./HighlightedCode";
import { MarkdownContent } from "./MarkdownContent";
import { nodeReplExecution } from "./mcp-execution";
import { PreviewableImage } from "./PreviewableImage";
import { SubagentThreadDetails } from "./SubagentThreadDetails";

type DetailEvent = CompactTraceEvent | TraceEvent;
type RecordValue = UnknownRecord;

export type SubagentDetailView = "trace" | "sequence";
export type OpenSubagentHandler = (
  thread: ThreadDetail,
  sourceEventId: string,
  sourceView: SubagentDetailView,
) => void;

export { eventRaw } from "../trace-event";

function preview(value: string, maximum = 4_000): string {
  if (value.length <= maximum) return value;
  return `${value.slice(0, maximum)}\n…`;
}

function lineCount(value: string): number {
  return value ? value.split("\n").length : 0;
}

function json(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function FieldList({ fields }: { fields: Array<[string, unknown]> }) {
  const visible = fields.filter(([, value]) => value !== undefined && value !== null && value !== "");
  return visible.length ? (
    <dl className="vbg-custom-event-fields">
      {visible.map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div>
      ))}
    </dl>
  ) : null;
}

function CodeBlock({ children, language, sourceLanguage }: { children: string; language?: string; sourceLanguage?: string }) {
  return <HighlightedCode className="vbg-custom-event-code" code={children} language={language} sourceLanguage={sourceLanguage} />;
}

function CommandDetails({ raw }: { raw: RecordValue }) {
  const command = commandText(raw.command);
  const output = text(raw.aggregatedOutput);
  const actions = Array.isArray(raw.commandActions) ? raw.commandActions.map(record) : [];

  return (
    <div className="vbg-custom-event-detail">
      {command && <CodeBlock language="bash">{command}</CodeBlock>}
      <FieldList fields={[["Working directory", workingDirectoryText(raw.cwd)], ["Process", raw.processId], ["Exit code", raw.exitCode]]} />
      {actions.length > 0 && (
        <div className="vbg-custom-event-actions" aria-label="Command actions">
          {actions.map((action, index) => {
            const kind = text(action.type) ?? "command";
            const target = text(action.path) ?? text(action.query) ?? text(action.name) ?? text(action.command);
            return <span key={`${kind}-${index}`}><strong>{kind}</strong>{target && <code>{target}</code>}</span>;
          })}
        </div>
      )}
      {output && <CodeBlock>{preview(output)}</CodeBlock>}
    </div>
  );
}

function McpDetails({ expandResult = false, raw }: { expandResult?: boolean; raw: RecordValue }) {
  const args = record(raw.arguments);
  const code = text(args.code) ?? text(args.function);
  const title = text(args.title);
  const result = record(raw.result);
  const content = Array.isArray(result.content) ? result.content.map(record) : [];
  const error = text(raw.error);
  const execution = nodeReplExecution(raw);
  const executionLabel = execution
    ? `${execution.label}${execution.source === "code" ? " (inferred)" : ""}`
    : undefined;
  const remainingArgs = Object.fromEntries(Object.entries(args).filter(([key]) => !["code", "function", "title"].includes(key)));

  return (
    <div className="vbg-custom-event-detail">
      {title && <p className="vbg-custom-event-lede">{title}</p>}
      <FieldList fields={[["Execution", executionLabel], ["Server", raw.server], ["Tool", raw.tool], ["Plugin", raw.pluginId], ["Read only", raw.readOnlyHint]]} />
      {code && <CodeBlock language={execution ? "javascript" : text(args.language)}>{preview(code)}</CodeBlock>}
      {Object.keys(remainingArgs).length > 0 && (
        <details className="vbg-custom-event-disclosure">
          <summary>Arguments · {Object.keys(remainingArgs).length} fields</summary>
          <CodeBlock language="json">{preview(json(remainingArgs))}</CodeBlock>
        </details>
      )}
      {error && <p className="vbg-custom-event-error" role="alert">{error}</p>}
      {content.length > 0 && (
        <details className="vbg-custom-event-disclosure" open={expandResult}>
          <summary>Result · {content.length} block{content.length === 1 ? "" : "s"}</summary>
          <div className="vbg-custom-event-results">
            {content.map((block, index) => {
              if (block.type === "text") return <CodeBlock key={index}>{preview(text(block.text) ?? "")}</CodeBlock>;
              if (block.type === "image") return <p key={index}>Image result · {String(block.mimeType ?? "unknown type")}</p>;
              return <CodeBlock key={index} language="json">{preview(json(block))}</CodeBlock>;
            })}
          </div>
        </details>
      )}
    </div>
  );
}

interface FileChangeEntry {
  diff?: string;
  kind: string;
  movePath?: string;
  path: string;
}

function fileChangeEntries(raw: RecordValue): FileChangeEntry[] {
  const changes = raw.changes;
  if (Array.isArray(changes)) {
    return changes.map(record).map((change) => ({
      diff: text(change.unifiedDiff) ?? text(change.unified_diff) ?? text(change.diff),
      kind: text(record(change.kind).type) ?? text(change.kind) ?? text(change.type) ?? "change",
      movePath: text(change.movePath) ?? text(change.move_path),
      path: text(change.path) ?? "Unknown file",
    }));
  }

  return Object.entries(record(changes)).map(([path, value]) => {
    const change = record(value);
    return {
      diff: text(change.unifiedDiff) ?? text(change.unified_diff) ?? text(change.diff),
      kind: text(change.type) ?? text(record(change.kind).type) ?? text(change.kind) ?? "change",
      movePath: text(change.movePath) ?? text(change.move_path),
      path,
    };
  });
}

function FileChangeDetails({ fallback, raw }: { fallback: string; raw: RecordValue }) {
  const changes = fileChangeEntries(raw);
  if (!changes.length) return <MarkdownContent>{fallback}</MarkdownContent>;

  return (
    <ul className="vbg-custom-file-changes">
      {changes.map((change, index) => {
        return (
          <li key={`${change.path}-${index}`}>
            <div className="vbg-custom-file-change__heading">
              <strong>{change.kind}</strong>
              <code title={change.path}>{change.path}</code>
            </div>
            {change.movePath && <p>Moved to <code title={change.movePath}>{change.movePath}</code></p>}
            {change.diff && <CodeBlock language="diff" sourceLanguage={languageForPath(change.path)}>{preview(change.diff, 12_000)}</CodeBlock>}
          </li>
        );
      })}
    </ul>
  );
}

function WebSearchDetails({ raw }: { raw: RecordValue }) {
  const results = Array.isArray(raw.results) ? raw.results.map(record) : [];
  return (
    <div className="vbg-custom-event-detail">
      <FieldList fields={[["Query", raw.query ?? record(raw.action).query], ["Action", record(raw.action).type]]} />
      {results.length > 0 && (
        <ol className="vbg-custom-search-results">
          {results.slice(0, 8).map((result, index) => (
            <li key={`${String(result.ref_id)}-${index}`}>
              {text(result.url) ? <a href={text(result.url)} rel="noreferrer" target="_blank">{String(result.title ?? result.url)}</a> : <strong>{String(result.title ?? result.ref_id ?? "Result")}</strong>}
              {text(result.domain) && <span>{text(result.domain)}</span>}
              {text(result.snippet) && <p>{text(result.snippet)}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function SubagentDetails({
  autoLoad,
  detailView,
  event,
  raw,
  onOpenSubagent,
}: {
  autoLoad: boolean;
  detailView: SubagentDetailView;
  event: DetailEvent;
  raw: RecordValue;
  onOpenSubagent?: OpenSubagentHandler;
}) {
  return (
    <div className="vbg-custom-event-detail">
      <SubagentThreadDetails
        autoLoad={autoLoad}
        detailView={detailView}
        fallbackInput={text(raw.prompt)}
        onOpenThread={(thread) => onOpenSubagent?.(thread, traceEventId(event), detailView)}
        raw={raw}
      />
    </div>
  );
}

function UserMessageDetails({ event, fallback, raw }: { event: DetailEvent; fallback: string; raw: RecordValue }) {
  const content = Array.isArray(raw.content) ? raw.content.map(record) : [];
  const images = content.flatMap((entry, index) => (entry.type === "localImage" || entry.type === "local_image") && text(entry.path)
    ? [{ index, path: text(entry.path)! }]
    : []);
  const canLoadImages = Boolean(event.turnId && event.itemId);

  return (
    <div className="vbg-custom-user-message">
      <MarkdownContent>{fallback}</MarkdownContent>
      {images.length > 0 && (
        <div aria-label="User attachments" className="vbg-custom-user-attachments">
          {images.map((image) => {
            if (!canLoadImages) return <span key={`${image.index}-${image.path}`}>Image attachment unavailable</span>;
            const source = `/api/attachments/${encodeURIComponent(event.threadId)}/${encodeURIComponent(event.turnId!)}/${encodeURIComponent(event.itemId!)}/${image.index}`;
            const label = image.path.split("/").pop() ?? "User attachment";
            return (
              <PreviewableImage alt={label} key={`${image.index}-${image.path}`} src={source} />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function EventDetails({
  autoLoadSubagent = false,
  event,
  expandResult = false,
  fallback,
  onOpenSubagent,
  subagentView = "trace",
}: {
  autoLoadSubagent?: boolean;
  event: DetailEvent;
  expandResult?: boolean;
  fallback: string;
  onOpenSubagent?: OpenSubagentHandler;
  subagentView?: SubagentDetailView;
}) {
  const raw = eventRaw(event);
  const type = normalizedEventType(event);

  if (type === "usermessage") return <UserMessageDetails event={event} fallback={fallback} raw={raw} />;
  if (type === "commandexecution") return <CommandDetails raw={raw} />;
  if (type === "mcptoolcall") return <McpDetails expandResult={expandResult} raw={raw} />;
  if (type === "filechange") return <FileChangeDetails fallback={fallback} raw={raw} />;
  if (type.includes("websearch")) return <WebSearchDetails raw={raw} />;
  if (type === "subagentactivity" || type === "collabagenttoolcall") {
    return (
      <SubagentDetails
        autoLoad={autoLoadSubagent}
        detailView={subagentView}
        event={event}
        onOpenSubagent={onOpenSubagent}
        raw={raw}
      />
    );
  }
  if (type === "imageview") return <FieldList fields={[["Image", raw.path]]} />;
  if (type === "imagegeneration") return <FieldList fields={[["Saved path", raw.savedPath], ["Prompt", raw.revisedPrompt]]} />;
  return <MarkdownContent>{fallback}</MarkdownContent>;
}
