import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import type { ComponentPropsWithoutRef } from "react";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("python", python);
hljs.registerLanguage("typescript", typescript);

const LANGUAGE_ALIASES: Record<string, string> = {
  cjs: "javascript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  patch: "diff",
  plain: "plaintext",
  py: "python",
  sh: "bash",
  shell: "bash",
  shellscript: "bash",
  text: "plaintext",
  ts: "typescript",
  tsx: "typescript",
  txt: "plaintext",
  udiff: "diff",
  zsh: "bash",
};

const SUPPORTED_LANGUAGES = new Set([
  "bash", "css", "diff", "javascript", "json", "plaintext", "python", "typescript",
]);

const PATH_LANGUAGE: Record<string, string> = {
  bash: "bash",
  cjs: "javascript",
  css: "css",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  mjs: "javascript",
  py: "python",
  sh: "bash",
  ts: "typescript",
  tsx: "typescript",
  zsh: "bash",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  })[character]!);
}

export function normalizeCodeLanguage(language?: string): string {
  const value = language?.trim().toLowerCase() || "plaintext";
  const normalized = LANGUAGE_ALIASES[value] ?? value;
  return SUPPORTED_LANGUAGES.has(normalized) ? normalized : "plaintext";
}

export function languageForPath(path: string): string | undefined {
  const extension = /\.([^.\/]+)$/.exec(path)?.[1]?.toLowerCase();
  return extension ? PATH_LANGUAGE[extension] : undefined;
}

function highlightSource(code: string, language: string): string {
  if (language === "plaintext" || language === "diff") return escapeHtml(code);
  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}

function diffLineKind(line: string): "addition" | "context" | "deletion" | "header" | "hunk" {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("diff ") || line.startsWith("index ")) return "header";
  if (line.startsWith("+")) return "addition";
  if (line.startsWith("-")) return "deletion";
  return "context";
}

function highlightDiff(code: string, sourceLanguage?: string): string {
  const normalizedSource = normalizeCodeLanguage(sourceLanguage);
  return code.split("\n").map((line) => {
    const kind = diffLineKind(line);
    const hasCodePrefix = kind === "addition" || kind === "deletion" || (kind === "context" && line.startsWith(" "));
    const prefix = hasCodePrefix ? line.slice(0, 1) : "";
    const content = hasCodePrefix ? line.slice(1) : line;
    const highlighted = kind === "hunk" || kind === "header"
      ? escapeHtml(content)
      : highlightSource(content, normalizedSource);
    return `<span class="hljs-diff-line hljs-diff-line--${kind}">${prefix ? `<span class="hljs-diff-prefix">${escapeHtml(prefix)}</span>` : ""}${highlighted}</span>`;
  }).join("\n");
}

export function highlightedCodeHtml(code: string, language?: string, sourceLanguage?: string): string {
  const normalized = normalizeCodeLanguage(language);
  return normalized === "diff" ? highlightDiff(code, sourceLanguage) : highlightSource(code, normalized);
}

export function HighlightedCode({
  className,
  code,
  language,
  sourceLanguage,
  ...props
}: Omit<ComponentPropsWithoutRef<"pre">, "children"> & {
  code: string;
  language?: string;
  sourceLanguage?: string;
}) {
  const normalized = normalizeCodeLanguage(language);
  const markup = highlightedCodeHtml(code, normalized, sourceLanguage);
  return (
    <pre {...props} className={["vbg-custom-code-block", className].filter(Boolean).join(" ")} data-language={normalized}>
      <code className={`hljs language-${normalized}`} dangerouslySetInnerHTML={{ __html: markup }} />
    </pre>
  );
}
