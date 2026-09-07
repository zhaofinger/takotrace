export interface QuestionReply {
  question: string;
  answer: string;
}

export function parseQuestionReply(text: string): QuestionReply[] | undefined {
  const match = /^\s*<send_user_message_question_reply>\s*([\s\S]*?)\s*<\/send_user_message_question_reply>\s*$/.exec(text);
  if (!match) return undefined;
  try {
    const value: unknown = JSON.parse(match[1]);
    if (!Array.isArray(value) || !value.length) return undefined;
    const replies: QuestionReply[] = [];
    for (const entry of value) {
      if (!entry || typeof entry !== 'object'
        || typeof entry.question !== 'string' || typeof entry.answer !== 'string') return undefined;
      replies.push({ question: entry.question, answer: entry.answer });
    }
    return replies;
  } catch {
    return undefined;
  }
}

export function extractUserRequest(text: string): string {
  if (parseQuestionReply(text)) return text.trim();
  const marker = /## My request:\s*/i.exec(text);
  return marker ? text.slice(marker.index + marker[0].length).trim() : text;
}

export function userMessageSummary(text: string): string {
  const request = extractUserRequest(text);
  const replies = parseQuestionReply(request);
  return replies
    ? `Answer: ${replies.map(({ answer }) => answer.trim() || '(empty)').join('; ')}`
    : request;
}

export function userMessageText(raw: Record<string, unknown>): string | undefined {
  const content = Array.isArray(raw.content)
    ? raw.content.map((entry) => entry && typeof entry.text === 'string' ? entry.text : '').filter(Boolean).join('\n\n')
    : typeof raw.text === 'string' ? raw.text : '';
  return extractUserRequest(content).trim() || undefined;
}
