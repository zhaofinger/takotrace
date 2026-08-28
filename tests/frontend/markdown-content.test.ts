import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MarkdownContent, requestOpenLocalPath } from "../../src/web/components/MarkdownContent";
import { EventDetails } from "../../src/web/components/EventDetails";

describe("MarkdownContent", () => {
  it("renders common Markdown and GFM structures", () => {
    const markdown = [
      "## Result",
      "",
      "- **Passed**",
      "- Use `npm test`",
      "",
      "| Check | Status |",
      "| --- | --- |",
      "| Tests | OK |",
      "",
      "[Details](https://example.com)",
    ].join("\n");
    const markup = renderToStaticMarkup(createElement(MarkdownContent, null, markdown));

    expect(markup).toContain("<h2>Result</h2>");
    expect(markup).toContain("<ul>");
    expect(markup).toContain("<strong>Passed</strong>");
    expect(markup).toContain("<code>npm test</code>");
    expect(markup).toContain("<table>");
    expect(markup).toContain('href="https://example.com"');
    expect(markup).toContain('target="_blank"');
  });

  it("highlights fenced code while leaving inline code inline", () => {
    const markup = renderToStaticMarkup(createElement(
      MarkdownContent,
      null,
      ["Use `const` inline.", "", "```ts", "const answer: number = 42;", "```"].join("\n"),
    ));

    expect(markup).toContain("Use <code>const</code> inline.");
    expect(markup).toContain('class="vbg-custom-code-block vbg-custom-markdown-code"');
    expect(markup).toContain('data-language="typescript"');
    expect(markup).toContain("hljs-keyword");
    expect(markup).not.toContain("<pre><pre");
  });

  it("renders absolute local file links as explicit host-open buttons", () => {
    const markup = renderToStaticMarkup(createElement(
      MarkdownContent,
      null,
      "[$eli5](/Users/example/.agents/skills/eli5/SKILL.md)",
    ));

    expect(markup).toContain('<button aria-label="Open /Users/example/.agents/skills/eli5/SKILL.md"');
    expect(markup).toContain('class="vbg-custom-markdown__local-file"');
    expect(markup).toContain('type="button">$eli5</button>');
    expect(markup).not.toContain('href=');
    expect(markup).not.toContain('/api/source');
  });

  it("requests a same-origin host open without converting the path to file://", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    await requestOpenLocalPath("/Users/example/带 空格.html", fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith("/api/host.openPath", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "/Users/example/带 空格.html" }),
    });
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain("file://");
  });

  it("reports host-open request failures", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 403 }));
    await expect(requestOpenLocalPath("/Users/example/file.html", fetchImpl))
      .rejects.toThrow("Unable to open local file (403)");
  });

  it("does not execute raw HTML", () => {
    const markup = renderToStaticMarkup(createElement(
      MarkdownContent,
      null,
      "Before <script>alert('xss')</script> after",
    ));

    expect(markup).not.toContain("<script>");
    expect(markup).toContain("&lt;script&gt;");
  });

  it("renders remote and Codex visualization images while rejecting other local file paths", () => {
    const remote = renderToStaticMarkup(createElement(
      MarkdownContent,
      null,
      "![Preview](https://example.com/preview.png)",
    ));
    const local = renderToStaticMarkup(createElement(
      MarkdownContent,
      null,
      "![Preview](/Users/example/preview.png)",
    ));
    const visualization = renderToStaticMarkup(createElement(
      MarkdownContent,
      null,
      "![Preview](/Users/example/.codex/visualizations/thread/preview.png)",
    ));

    expect(remote).toContain('aria-haspopup="dialog"');
    expect(remote).toContain('aria-label="Enlarge Preview"');
    expect(remote).toContain('class="vbg-custom-image-thumbnail"');
    expect(remote).toContain('<img alt="Preview" loading="lazy" src="https://example.com/preview.png"');
    expect(local).not.toContain("<img");
    expect(local).toContain("vbg-custom-markdown__local-image");
    expect(local).toContain("/Users/example/preview.png");
    expect(visualization).toContain('src="/api/visualization?path=%2FUsers%2Fexample%2F.codex%2Fvisualizations%2Fthread%2Fpreview.png"');
  });

  it("renders camelCase and snake_case local image blocks attached to user prompts", () => {
    const markup = renderToStaticMarkup(createElement(EventDetails, {
      event: {
        seq: 1,
        at: "2026-01-01T00:00:00.000Z",
        method: "item/completed",
        type: "userMessage",
        status: "completed",
        threadId: "thread space",
        turnId: "turn space",
        itemId: "item space",
        summary: "Prompt",
        raw: {
          type: "userMessage",
          content: [
            { type: "text", text: "Prompt" },
            { type: "localImage", path: "/tmp/prompt.png" },
            { type: "local_image", path: "/tmp/reference.png" },
          ],
        },
      },
      fallback: "**Prompt**",
    }));

    expect(markup).toContain("<strong>Prompt</strong>");
    expect(markup).toContain('aria-label="User attachments"');
    expect(markup).toContain('src="/api/attachments/thread%20space/turn%20space/item%20space/1"');
    expect(markup).toContain('alt="prompt.png"');
    expect(markup).toContain('src="/api/attachments/thread%20space/turn%20space/item%20space/2"');
    expect(markup).toContain('alt="reference.png"');
    expect(markup).toContain('aria-label="Enlarge prompt.png"');
    expect(markup).toContain('aria-label="Enlarge reference.png"');
    expect(markup).not.toContain('target="_blank"');
  });
});
