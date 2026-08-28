import { asRecord as record, nonEmptyText as text, type UnknownRecord } from "../value-utils";

type RecordValue = UnknownRecord;

function skillNameFromPath(value: unknown): string | undefined {
  const path = text(value)?.replaceAll("\\", "/");
  if (!path || (!path.includes("/skills/") && !path.startsWith("skills/")) || !path.endsWith("/SKILL.md")) return undefined;
  return path.split("/").at(-2);
}

function commandActions(raw: RecordValue): RecordValue[] {
  const values = Array.isArray(raw.commandActions)
    ? raw.commandActions
    : Array.isArray(raw.parsed_cmd)
      ? raw.parsed_cmd
      : [];
  return values.map(record);
}

function namesFromCommand(value: unknown): string[] {
  const command = text(value) ?? (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").join(" ") : "");
  const paths = command.match(/(?:file:\/\/)?[^\s"'`]*skills\/[^\s"'`]+\/SKILL\.md/g) ?? [];
  return paths.map(skillNameFromPath).filter((name): name is string => Boolean(name));
}

export interface InferredSkillLoad {
  names: string[];
  displayTitle: string;
}

export function inferredSkillLoad(raw: RecordValue): InferredSkillLoad | undefined {
  const actionNames = commandActions(raw)
    .filter((action) => text(action.type)?.toLowerCase() === "read")
    .map((action) => skillNameFromPath(action.path));
  const names = [...new Set([...actionNames, ...namesFromCommand(raw.command)].filter((name): name is string => Boolean(name)))];
  if (!names.length) return undefined;
  const remainder = names.length > 1 ? ` +${names.length - 1}` : "";
  return {
    names,
    displayTitle: `Skill load · ${names[0]}${remainder} (inferred)`,
  };
}
