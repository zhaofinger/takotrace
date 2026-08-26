import { describe, expect, it } from "vitest";
import { graphNodeVisual, isPrimaryGraphKind } from "../../src/web/components/trace-graph-visual.js";

describe("trace graph visual semantics", () => {
  it("uses shape for hierarchy without creating too many variants", () => {
    expect(graphNodeVisual("user").shape).toBe("circle");
    expect(graphNodeVisual("agent").shape).toBe("rect");
    expect(graphNodeVisual("tool").shape).toBe("rect");
    expect(graphNodeVisual("skill").shape).toBe(graphNodeVisual("mcp").shape);
  });

  it("emphasizes user and agent over supporting execution nodes", () => {
    expect(isPrimaryGraphKind("user")).toBe(true);
    expect(isPrimaryGraphKind("agent")).toBe(true);
    expect(graphNodeVisual("tool").emphasis).toBe("secondary");
    expect(graphNodeVisual("reasoning").emphasis).toBe("muted");
  });
});
