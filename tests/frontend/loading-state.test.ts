import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoadingState } from "../../src/web/components/LoadingState";

describe("LoadingState", () => {
  it("exposes one polite status with a decorative progress animation", () => {
    const markup = renderToStaticMarkup(createElement(LoadingState, {
      description: "Fetching events.",
      label: "Loading run details…",
    }));

    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-hidden="true" class="vbg-custom-spinner"');
    expect(markup).toContain("Loading run details…");
    expect(markup).toContain("Fetching events.");
  });
});
