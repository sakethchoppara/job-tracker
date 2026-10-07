import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReply } from '../src/llm.js';
import { AnalysisSchema } from '../src/schemas.js';

const valid = {
  score: 62, verdict: 'Solid base.',
  missing_keywords: [{ keyword: 'AWS', why: 'Required.' }],
  red_flags: [{ flag: 'No metrics', why: 'Tasks, not results.', fix: 'Add outcomes.' }],
  extracted: { experience: null, location: 'Remote' },
};

test('accepts valid JSON, even wrapped in prose or fences', () => {
  assert.deepEqual(parseReply('```json\n' + JSON.stringify(valid) + '\n```', AnalysisSchema).data, valid);
});

test('rejects a reply cut off mid-string (the Gemini thinking-budget bug)', () => {
  assert.match(parseReply(JSON.stringify(valid).slice(0, 60), AnalysisSchema).error, /No JSON object|Invalid JSON/);
});

test('names the field that fails the schema', () => {
  const { error } = parseReply(JSON.stringify({ ...valid, score: 140, red_flags: [] }), AnalysisSchema);
  assert.match(error, /score/);
  assert.match(error, /red_flags/);
});
