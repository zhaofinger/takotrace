import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  HighlightedCode,
  highlightedCodeHtml,
  languageForPath,
  normalizeCodeLanguage,
} from "../../src/web/components/HighlightedCode";

describe("HighlightedCode", () => {
  it("normalizes common language aliases and file extensions", () => {
    expect(normalizeCodeLanguage("tsx")).toBe("typescript");
    expect(normalizeCodeLanguage("shellscript")).toBe("bash");
    expect(normalizeCodeLanguage("patch")).toBe("diff");
    expect(normalizeCodeLanguage("unknown-language")).toBe("plaintext");
    expect(languageForPath("/workspace/src/App.tsx")).toBe("typescript");
    expect(languageForPath("Dockerfile")).toBeUndefined();
  });

  it("renders JavaScript tokens while escaping unsafe source text", () => {
    const highlighted = highlightedCodeHtml("const answer = '<script>';", "javascript");
    const plaintext = highlightedCodeHtml("<script>alert('xss')</script>", "unknown-language");

    expect(highlighted).toContain('class="hljs-keyword"');
    expect(highlighted).toContain('class="hljs-string"');
    expect(highlighted).toContain("&lt;script&gt;");
    expect(plaintext).toBe("&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;");
  });

  it("marks diff additions, deletions, hunks, headers, and source tokens", () => {
    const markup = renderToStaticMarkup(createElement(HighlightedCode, {
      code: [
        "--- a/src/App.tsx",
        "+++ b/src/App.tsx",
        "@@ -1,2 +1,2 @@",
        "-const oldValue = true;",
        "+const newValue = false;",
        " context();",
      ].join("\n"),
      language: "diff",
      sourceLanguage: "typescript",
    }));

    expect(markup).toContain('data-language="diff"');
    expect(markup).toContain("hljs-diff-line--header");
    expect(markup).toContain("hljs-diff-line--hunk");
    expect(markup).toContain("hljs-diff-line--deletion");
    expect(markup).toContain("hljs-diff-line--addition");
    expect(markup).toContain("hljs-diff-line--context");
    expect(markup).toContain("hljs-keyword");
    expect(markup).toContain("hljs-literal");
  });
});
