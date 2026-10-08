import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { Agent } from '../src/llm.js';

// A scripted provider: returns the queued replies in order and records every prompt it saw.
class FakeAgent extends Agent {
  constructor(replies) { super('fake-model'); this.replies = replies; this.prompts = []; }
  async request(system, prompt) {
    this.prompts.push(prompt);
    const next = this.replies.shift();
    if (next instanceof Error) throw next;
    return next;
  }
}
const Schema = z.object({ score: z.number().max(100) });

test('Agent is abstract', () => {
  assert.throws(() => new Agent('x'), /abstract/);
});

test('completeJSON retries once, telling the model what was wrong', async () => {
  const agent = new FakeAgent(['{"score": 140}', '{"score": 70}']);
  assert.deepEqual(await agent.completeJSON('sys', 'rate me', Schema), { score: 70 });
  assert.match(agent.prompts[1], /did not match the required JSON shape[\s\S]*score/);
});

test('completeJSON gives up after the retry', async () => {
  await assert.rejects(new FakeAgent(['nope', '{"score": "x"}']).completeJSON('s', 'p', Schema), /expected format/);
});

test('429s become a readable quota message with the reset time', async () => {
  const quota = Object.assign(new Error('limit: 20\nPlease retry in 7h58m10.32s.'), { status: 429 });
  await assert.rejects(new FakeAgent([quota]).completeText('s', 'p'), /fake-model quota or rate limit reached; it resets in about 7h58m10s/);
});
