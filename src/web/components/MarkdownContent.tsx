import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  a: ({ children, href, ...props }) => {
    const localHref = href && /^\/(?:Users|home|private|tmp|var|opt|workspace)(?:\/|$)/.test(href)
      ? `/api/source?ref=${hexEncode(href)}`
      : href;
    return <a {...props} href={localHref} rel="noreferrer" target="_blank">{children}</a>;
  },
  img: ({ alt, src }) => {
    if (src?.includes("/.codex/visualizations/")) {
      return <img alt={alt ?? ""} loading="lazy" src={`/api/visualization?path=${encodeURIComponent(src)}`} />;
    }

    if (src?.startsWith("/")) {
      return (
        <span className="vbg-custom-markdown__local-image">
          <span>{alt || "Local image"}</span>
          <code>{src}</code>
        </span>
      );
    }

    return <img alt={alt ?? ""} loading="lazy" src={src} />;
  },
};

function hexEncode(value: string): string {
  return Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
