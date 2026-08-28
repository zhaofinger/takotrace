import { Children, isValidElement, useState, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { HighlightedCode } from "./HighlightedCode";
import { PreviewableImage } from "./PreviewableImage";

const components: Components = {
  a: ({ children, href, ...props }) => {
    if (href && /^\/(?:Users|home|private|tmp|var|opt|workspace)(?:\/|$)/.test(href)) {
      return <LocalFileLink path={href}>{children}</LocalFileLink>;
    }
    return <a {...props} href={href} rel="noreferrer" target="_blank">{children}</a>;
  },
  img: ({ alt, src }) => {
    if (src?.includes("/.codex/visualizations/")) {
      return <PreviewableImage alt={alt ?? ""} src={`/api/visualization?path=${encodeURIComponent(src)}`} />;
    }

    if (src?.startsWith("/")) {
      return (
        <span className="vbg-custom-markdown__local-image">
          <span>{alt || "Local image"}</span>
          <code>{src}</code>
        </span>
      );
    }

    return <PreviewableImage alt={alt ?? ""} src={src} />;
  },
  pre: ({ children }) => {
    const child = Children.toArray(children)[0];
    if (!isValidElement<{ children?: ReactNode; className?: string }>(child)) return <pre>{children}</pre>;
    const language = /(?:^|\s)language-([^\s]+)/.exec(child.props.className ?? "")?.[1];
    const code = nodeText(child.props.children).replace(/\n$/, "");
    return <HighlightedCode className="vbg-custom-markdown-code" code={code} language={language} />;
  },
};

function nodeText(value: ReactNode): string {
  if (Array.isArray(value)) return value.map(nodeText).join("");
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function LocalFileLink({ children, path }: { children: ReactNode; path: string }) {
  const [error, setError] = useState<string>();
  const [opening, setOpening] = useState(false);

  const open = async () => {
    setError(undefined);
    setOpening(true);
    try {
      await requestOpenLocalPath(path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setOpening(false);
    }
  };

  return (
    <button
      aria-label={`Open ${path}`}
      className="vbg-custom-markdown__local-file"
      disabled={opening}
      onClick={() => void open()}
      title={error ?? path}
      type="button"
    >
      {children}
    </button>
  );
}

export async function requestOpenLocalPath(path: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl("/api/host.openPath", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) throw new Error(`Unable to open local file (${response.status})`);
}

const remarkPlugins = [remarkGfm];

const inlineComponents: Components = {
  a: ({ children }) => <span className="vbg-custom-inline-markdown__link">{children}</span>,
  img: ({ alt }) => <span>{alt || "Image"}</span>,
  p: ({ children }) => <span>{children}</span>,
};

export function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="vbg-custom-markdown">
      <Markdown components={components} remarkPlugins={remarkPlugins}>{children}</Markdown>
    </div>
  );
}

export function InlineMarkdown({ children }: { children: string }) {
  return (
    <span className="vbg-custom-inline-markdown">
      <Markdown
        allowedElements={["a", "br", "code", "del", "em", "img", "p", "strong"]}
        components={inlineComponents}
        remarkPlugins={remarkPlugins}
        unwrapDisallowed
      >
        {children}
      </Markdown>
    </span>
  );
}
