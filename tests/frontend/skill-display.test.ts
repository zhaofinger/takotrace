import { describe, expect, it } from "vitest";
import { inferredSkillLoad } from "../../src/web/components/skill-display";

describe("inferredSkillLoad", () => {
  it("collects skill reads from parsed command actions", () => {
    expect(inferredSkillLoad({
      command: ["/bin/zsh", "-lc", "sed -n '1,260p' /plugins/build-web-apps/skills/react-best-practices/SKILL.md"],
      parsed_cmd: [
        { type: "read", path: "/plugins/build-web-apps/skills/react-best-practices/SKILL.md" },
        { type: "read", path: "/plugins/build-web-apps/skills/frontend-testing-debugging/SKILL.md" },
        { type: "read", path: "/plugins/browser/skills/control-in-app-browser/SKILL.md" },
      ],
    })).toEqual({
      names: ["react-best-practices", "frontend-testing-debugging", "control-in-app-browser"],
      displayTitle: "Skill load · react-best-practices +2 (inferred)",
    });
  });

  it("falls back to exact SKILL.md paths in older command payloads", () => {
    expect(inferredSkillLoad({
      command: "cat /Users/bytedance/.agents/skills/read/SKILL.md",
    })).toMatchObject({
      names: ["read"],
      displayTitle: "Skill load · read (inferred)",
    });
  });

  it("does not classify ordinary file reads as skills", () => {
    expect(inferredSkillLoad({
      command: "sed -n '1,20p' README.md",
      parsed_cmd: [{ type: "read", path: "README.md" }],
    })).toBeUndefined();
  });
});
