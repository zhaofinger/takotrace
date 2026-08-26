import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusMark } from "../../src/web/components/StatusMark";

describe("StatusMark", () => {
  it("uses the same icon slot for completed and pending states", () => {
    const completed = renderToStaticMarkup(createElement(StatusMark, { label: false, status: "completed" }));
    const pending = renderToStaticMarkup(createElement(StatusMark, { label: false, status: "pending" }));

    expect(completed).toContain('class="vbg-custom-status__icon"');
    expect(pending).toContain('class="vbg-custom-status__icon"');
  });
});
