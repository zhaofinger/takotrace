import { describe, expect, it } from 'vitest';
import { resolveSubagentAssignment } from '../../src/server/subagent-assignment.js';

describe('resolveSubagentAssignment', () => {
  it('prefers the matching parent spawn prompt and keeps only allowlisted metadata', () => {
    const child = thread('child-a', [
      { id: 'child-input', type: 'userMessage', text: 'Child fallback' },
    ]);
    const parent = thread('parent', [
      {
        id: 'wrong-child', type: 'collabAgentToolCall', tool: 'spawnAgent',
        receiverThreadIds: ['child-b'], prompt: 'Wrong task',
      },
      {
        id: 'spawn-a', type: 'collabAgentToolCall', tool: 'spawnAgent',
        receiverThreadIds: ['child-a'], prompt: 'Implement the backend contract',
      },
      {
        id: 'activity-a', type: 'subAgentActivity', agentThreadId: 'child-a',
        arguments: {
          task_name: 'assignment_backend', agent_type: 'worker', fork_turns: 'all',
          message: 'Rollout fallback', secret: 'must not be returned',
        },
      },
    ]);

    expect(resolveSubagentAssignment('child-a', child, parent)).toEqual({
      availability: 'available',
      text: 'Implement the backend contract',
      source: 'parent-prompt',
      taskName: 'assignment_backend',
      agentType: 'worker',
      forkTurns: 'all',
    });
  });

  it('uses a child user message before a plaintext parent rollout fallback', () => {
    const child = thread('child', [
      { id: 'inherited-input', type: 'userMessage', text: 'Inherited parent request' },
      { id: 'input', type: 'user_message', content: [{ type: 'input_text', text: 'Child assignment' }] },
    ]);
    const parent = thread('parent', [
      {
        id: 'activity', type: 'sub_agent_activity', agent_thread_id: 'child',
        arguments: JSON.stringify({ message: 'Parent rollout assignment', task_name: 'child_task' }),
      },
    ]);

    expect(resolveSubagentAssignment('child', child, parent)).toEqual({
      availability: 'available',
      text: 'Child assignment',
      source: 'child-user-message',
      taskName: 'child_task',
    });
  });

  it('returns plaintext from the exactly matching parent activity only', () => {
    const parent = thread('parent', [
      {
        id: 'wrong', type: 'subAgentActivity', agentThreadId: 'other-child',
        arguments: { message: 'Wrong task', task_name: 'wrong' },
      },
      {
        id: 'right', type: 'subAgentActivity', agentThreadId: 'child',
        arguments: { message: 'Exact rollout task', task_name: 'right' },
      },
    ]);

    expect(resolveSubagentAssignment('child', thread('child', []), parent)).toEqual({
      availability: 'available',
      text: 'Exact rollout task',
      source: 'parent-rollout',
      taskName: 'right',
    });
  });

  it('marks encrypted task content without returning ciphertext', () => {
    const ciphertext = `gAAAA${'A'.repeat(48)}`;
    const parent = thread('parent', [{
      id: 'activity', type: 'subAgentActivity', agentThreadId: 'child',
      arguments: { message: ciphertext, task_name: 'safe-name', agent_type: 'worker' },
    }]);

    const assignment = resolveSubagentAssignment('child', thread('child', [{
      id: 'input', type: 'userMessage', content: [{ type: 'encrypted_content', data: ciphertext }],
    }]), parent);
    expect(assignment).toEqual({
      availability: 'encrypted', taskName: 'safe-name', agentType: 'worker',
    });
    expect(JSON.stringify(assignment)).not.toContain(ciphertext);
  });

  it('recognizes encrypted_content stored as the rollout message object', () => {
    const parent = thread('parent', [{
      id: 'activity', type: 'subAgentActivity', agentThreadId: 'child',
      arguments: {
        message: { type: 'encrypted_content', encrypted_content: 'opaque' },
        task_name: 'safe-name',
      },
    }]);
    expect(resolveSubagentAssignment('child', thread('child', []), parent)).toEqual({
      availability: 'encrypted', taskName: 'safe-name',
    });
  });

  it('reports not-recorded when no matching assignment evidence exists', () => {
    const parent = thread('parent', [{
      id: 'other', type: 'subAgentActivity', agentThreadId: 'other-child',
      arguments: { message: 'Other task', task_name: 'other' },
    }]);
    expect(resolveSubagentAssignment('child', thread('child', []), parent)).toEqual({
      availability: 'not-recorded',
    });
  });
});

function thread(id: string, items: Array<Record<string, unknown>>) {
  return { id, turns: [{ id: 'turn', items }] };
}
