export interface SubagentAssignment {
  availability: 'available' | 'encrypted' | 'not-recorded';
  text?: string;
  source?: 'parent-prompt' | 'child-user-message' | 'parent-rollout';
  taskName?: string;
  agentType?: string;
  forkTurns?: string;
}

type ValueRecord = Record<string, unknown>;

export function resolveSubagentAssignment(
  childThreadId: string,
  childThread: unknown,
  parentThread?: unknown,
): SubagentAssignment {
  const parentItems = threadItems(parentThread);
  const childItems = threadItems(childThread);
  const matchingActivity = parentItems.find((item) => isMatchingActivity(item, childThreadId));
  const argumentsValue = parsedArguments(matchingActivity?.arguments);
  const metadata = assignmentMetadata(argumentsValue);
  let encrypted = false;

  for (const item of parentItems) {
    if (!isMatchingPrompt(item, childThreadId)) continue;
    const prompt = contentValue(item.prompt);
    if (prompt.text) {
      return { availability: 'available', text: prompt.text, source: 'parent-prompt', ...metadata };
    }
    encrypted ||= prompt.encrypted;
  }

  for (const item of [...childItems].reverse()) {
    if (normalizedType(item.type) !== 'usermessage') continue;
    const message = messageText(item);
    if (message.text) {
      return { availability: 'available', text: message.text, source: 'child-user-message', ...metadata };
    }
    encrypted ||= message.encrypted;
  }

  if (matchingActivity) {
    const assignedMessage = contentValue(argumentsValue.message);
    const message = assignedMessage.text || assignedMessage.encrypted
      ? assignedMessage
      : messageText(argumentsValue);
    if (message.text) {
      return { availability: 'available', text: message.text, source: 'parent-rollout', ...metadata };
    }
    encrypted ||= message.encrypted;
  }

  return { availability: encrypted ? 'encrypted' : 'not-recorded', ...metadata };
}

function threadItems(threadValue: unknown): ValueRecord[] {
  const thread = record(threadValue);
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  return turns.flatMap((turnValue) => {
    const items = record(turnValue).items;
    return Array.isArray(items) ? items.map(itemRecord) : [];
  });
}

function itemRecord(value: unknown): ValueRecord {
  const item = record(value);
  const notificationItem = record(record(record(item.raw).params).item);
  return Object.keys(notificationItem).length ? { ...notificationItem, ...item } : item;
}

function isMatchingPrompt(item: ValueRecord, childThreadId: string): boolean {
  if (normalizedType(item.type) !== 'collabagenttoolcall') return false;
  const tool = normalizedType(item.tool);
  if (tool && tool !== 'spawnagent') return false;
  const receivers = item.receiverThreadIds ?? item.receiver_thread_ids;
  return Array.isArray(receivers) && receivers.includes(childThreadId);
}

function isMatchingActivity(item: ValueRecord, childThreadId: string): boolean {
  if (normalizedType(item.type) !== 'subagentactivity') return false;
  return stringValue(item.agentThreadId ?? item.agent_thread_id) === childThreadId;
}

function parsedArguments(value: unknown): ValueRecord {
  if (typeof value !== 'string') return record(value);
  try {
    return record(JSON.parse(value));
  } catch {
    return {};
  }
}

function assignmentMetadata(argumentsValue: ValueRecord): Omit<SubagentAssignment, 'availability' | 'text' | 'source'> {
  const taskName = safeMetadata(argumentsValue.task_name ?? argumentsValue.taskName);
  const agentType = safeMetadata(argumentsValue.agent_type ?? argumentsValue.agentType);
  const forkTurns = safeMetadata(argumentsValue.fork_turns ?? argumentsValue.forkTurns);
  return {
    ...(taskName ? { taskName } : {}),
    ...(agentType ? { agentType } : {}),
    ...(forkTurns ? { forkTurns } : {}),
  };
}

function safeMetadata(value: unknown): string | undefined {
  const text = stringValue(value)?.trim();
  return text && !isCiphertext(text) ? text : undefined;
}

function messageText(value: unknown): { text?: string; encrypted: boolean } {
  const message = record(value);
  if (normalizedType(message.type) === 'encryptedcontent') return { encrypted: true };
  const direct = plaintext(message.text);
  if (direct.text) return direct;
  let encrypted = direct.encrypted || hasEncryptedContent(message);
  const content = Array.isArray(message.content) ? message.content : [];
  const texts: string[] = [];
  for (const entryValue of content) {
    const entry = record(entryValue);
    const type = normalizedType(entry.type);
    if (type === 'encryptedcontent') {
      encrypted = true;
      continue;
    }
    if (type !== 'text' && type !== 'inputtext') continue;
    const candidate = plaintext(entry.text);
    if (candidate.text) texts.push(candidate.text);
    encrypted ||= candidate.encrypted;
  }
  return texts.length ? { text: texts.join('\n'), encrypted } : { encrypted };
}

function contentValue(value: unknown): { text?: string; encrypted: boolean } {
  if (typeof value === 'string') return plaintext(value);
  if (Array.isArray(value)) return messageText({ content: value });
  return messageText(value);
}

function plaintext(value: unknown): { text?: string; encrypted: boolean } {
  const text = stringValue(value)?.trim();
  if (!text) return { encrypted: false };
  return isCiphertext(text) ? { encrypted: true } : { text, encrypted: false };
}

function hasEncryptedContent(value: ValueRecord): boolean {
  if (value.encrypted_content !== undefined || value.encryptedContent !== undefined) return true;
  return Array.isArray(value.content)
    && value.content.some((entry) => normalizedType(record(entry).type) === 'encryptedcontent');
}

function isCiphertext(value: string): boolean {
  return /^gAAAA[A-Za-z0-9_-]+={0,2}$/.test(value);
}

function normalizedType(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase().replaceAll(/[^a-z]/g, '') : '';
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function record(value: unknown): ValueRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ValueRecord : {};
}
