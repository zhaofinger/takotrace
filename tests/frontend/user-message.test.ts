import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { notificationToTrace, threadToHistory } from '../../src/shared/trace';
import { parseQuestionReply, userMessageSummary, userMessageText } from '../../src/shared/user-message';
import { EventDetails } from '../../src/web/components/EventDetails';
import { flowNode } from '../../src/web/components/InteractionFlow';
import { buildSequenceDiagramModel } from '../../src/web/components/sequence-diagram-model';

const replies = [
  { questionItemId: '["request_user_input_async","call_example",0]', question: '照片和视频希望放到哪个文件夹？', answer: '照片 > 托班照片视频' },
  { questionItemId: '["request_user_input_async","call_example",1]', question: '备份频率？', answer: '每天\n保留原文件名_a_b' },
];
const wrap = (value: unknown) => `<send_user_message_question_reply>\n${JSON.stringify(value)}\n</send_user_message_question_reply>`;
const source = wrap(replies);
const item = { id: 'reply-1', type: 'userMessage', content: [{ type: 'text', text: source }] };
const event = { seq: 1, ...notificationToTrace({ method: 'item/completed', params: { threadId: 'thread-1', item } }) };

describe('structured user question replies', () => {
  it('extracts every question and answer while keeping routing metadata out of the presentation', () => {
    expect(parseQuestionReply(`  ${source}  `)).toEqual(replies.map(({ question, answer }) => ({ question, answer })));
    expect(userMessageSummary(source)).toBe('Answer: 照片 > 托班照片视频; 每天\n保留原文件名_a_b');
    expect(userMessageText({ text: source })).toBe(source);
    expect(userMessageText({ content: [null, { type: 'text', text: source }] })).toBe(source);
  });

  it('does not interpret quoted examples, mixed prose, malformed JSON or unsupported records as replies', () => {
    for (const text of [
      `Explain this format:\n${source}`, `\`\`\`xml\n${source}\n\`\`\``, `${source}\nAdditional instructions`,
      '<send_user_message_question_reply>{broken}</send_user_message_question_reply>',
      source.replace('</send_user_message_question_reply>', ''),
      wrap([]), wrap({ question: 'Q', answer: 'A' }), wrap([null]),
      wrap([{ question: 'Q', answer: ['A'] }]), wrap([...replies, { question: 'missing answer' }]),
    ]) {
      expect(parseQuestionReply(text)).toBeUndefined();
      expect(userMessageSummary(text)).toBe(text);
    }
  });

  it('preserves literal request markers inside replies and supports ordinary request envelopes', () => {
    const text = wrap([{ question: 'Explain ## My request:', answer: '<example>\n## My request: keep this' }]);
    expect(userMessageText({ content: [{ text }] })).toBe(text);
    expect(userMessageSummary(text)).toBe('Answer: <example>\n## My request: keep this');
    expect(userMessageSummary(`Context\n## My request:\n${source}`)).toBe(event.summary);
    expect(userMessageSummary('Context\n## My request:\nBuild the feature')).toBe('Build the feature');
  });

  it('uses answer summaries for live and historical events without changing raw data', () => {
    expect(event.summary).toBe(userMessageSummary(source));
    expect(event.raw).toEqual({ method: 'item/completed', params: { threadId: 'thread-1', item } });
    const history = threadToHistory({ id: 'thread-1', turns: [{ id: 'turn-1', items: [item] }] });
    expect(history?.turns[0].items[0].summary).toBe(event.summary);
  });

  it('shows answer summaries in sequence nodes and all questions in the detail content', () => {
    const node = flowNode(event);
    expect(node).toMatchObject({ kind: 'user', title: 'Answer', summary: event.summary });
    for (const { question, answer } of replies) {
      expect(node.detail).toContain(question);
      expect(node.detail).toContain(answer);
    }
    const step = buildSequenceDiagramModel([event]).steps[0];
    expect(step).toMatchObject({ from: 'user', to: 'agent', displayTitle: 'Answer: 照片 > 托班照片视频; 每天 保留原文件名_a_b' });
    const markup = renderToStaticMarkup(createElement(EventDetails, { event, fallback: node.detail }));
    expect(markup).toContain('<dt>Question 1</dt>');
    expect(markup).toContain('<dt>Question 2</dt>');
    expect(markup).toContain('照片 &gt; 托班照片视频');
    expect(markup).toContain('每天\n保留原文件名_a_b');
    expect(markup).not.toMatch(/send_user_message_question_reply|questionItemId|call_example/);
  });

  it('renders empty answers explicitly and escapes markup as literal response text', () => {
    const text = wrap([{ question: '<script>alert(1)</script>', answer: '' }]);
    const replyEvent = { ...event, raw: { content: [{ type: 'text', text }] } };
    const markup = renderToStaticMarkup(createElement(EventDetails, { event: replyEvent, fallback: text }));
    expect(markup).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(markup).toContain('(empty)');
    expect(userMessageSummary(text)).toBe('Answer: (empty)');
  });

  it('keeps invalid replies visible in the detail panel', () => {
    const text = '<send_user_message_question_reply>invalid JSON</send_user_message_question_reply>';
    const replyEvent = { ...event, raw: { content: [{ type: 'text', text }] } };
    expect(flowNode(replyEvent)).toMatchObject({ title: 'Request', detail: text });
    const markup = renderToStaticMarkup(createElement(EventDetails, { event: replyEvent, fallback: text }));
    expect(markup).toContain('invalid JSON');
  });
});
