import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMetrics } from '../src/hooks/useMetrics.js';
import { costOf, messageRecords, sessionAgg } from '../src/lib/cost.js';
import { filterSource } from '../src/lib/usage.js';
import { classify } from '../src/lib/classify.js';

const base = {
  device_id: 'laptop', session_id: 'shared-id', timestamp: '2026-10-05T10:00:00Z',
  project_name: 'app', tool_category: 'general', tool_name: 'Read', model: 'claude-opus-4',
  input_tokens: 100, output_tokens: 50, cache_read_tokens: 20, cache_creation_tokens: 0,
};
const rows = [
  { ...base, id: 'c1' },
  { ...base, id: 'c2', tool_name: 'Edit' }, // one Claude message, two tools
  { ...base, id: 'x1', source: 'codex', tool_name: 'functions.exec_command', model: 'gpt-5-codex', input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 },
  { ...base, id: 'x2', source: 'codex', record_type: 'usage', event_id: 'usage-1', tool_name: 'token_count', model: 'gpt-5-codex', input_tokens: 400, output_tokens: 100, cache_read_tokens: 600, reasoning_output_tokens: 40 },
  { ...base, id: 'x3', source: 'codex', record_type: 'usage', event_id: 'usage-2', tool_name: 'token_count', model: 'gpt-5-codex', input_tokens: 50, output_tokens: 40, cache_read_tokens: 50, reasoning_output_tokens: 10 },
];

test('mixed usage counts real tools and all distinct usage events once', () => {
  const m = calculateMetrics(rows, 'all');
  assert.equal(m.summary.total, '3');
  assert.equal(m.summary.input, '550');
  assert.equal(m.summary.output, '190');
  assert.equal(m.summary.cache, '670');
  assert.equal(m.summary.reasoning, '50');
  assert.equal(m.trend[0].value, 3);
  assert.equal(m.tokens[0].input, 550);
  assert.equal(m.sourceRows[1].tokens, 1240);
  assert.equal(m.sourceRows[1].calls, 1);
  assert.equal(m.sourceRows[1].sessions, 1);
  assert.equal(m.sessionRows.length, 2);
  assert.ok(!m.general.some(x => x.name === 'token_count'));
});

test('source filters retain legacy Claude rows and exclude Codex from Claude pricing', () => {
  assert.equal(filterSource(rows, 'claude').length, 2);
  const codex = calculateMetrics(filterSource(rows, 'codex'), 'all');
  assert.equal(codex.summary.total, '1');
  assert.equal(codex.summary.input, '450');
  assert.equal(codex.summary.cost, '미산정');
  assert.equal(codex.summary.costPerSession, '-');
  assert.equal(codex.sessionRows[0].cost, null);
  assert.equal(costOf(rows[3]), 0);
  assert.equal(calculateMetrics(rows, 'all').summary.cost, calculateMetrics(rows.slice(0, 2), 'all').summary.cost);
});

test('sessions and messages on different devices/sources do not collide', () => {
  const combined = [...rows, { ...rows[0], device_id: 'desktop', id: 'other-device' }];
  assert.equal(messageRecords(combined).length, 4);
  assert.equal(Object.keys(sessionAgg(combined)).length, 3);
});

test('Codex text-only responses contribute tokens and sessions but no calls', () => {
  const m = calculateMetrics([rows[3]], 'all');
  assert.equal(m.summary.total, '0');
  assert.equal(m.sourceRows[0].sessions, 1);
  assert.equal(m.sourceRows[0].tokens, 1100);
  assert.equal(m.sessionRows[0].calls, 0);
  assert.equal(m.trend.length, 0);
});

test('Codex tool namespaces classify into existing work types', () => {
  assert.equal(classify({ ...base, tool_name: 'functions.apply_patch' }), '코드편집');
  assert.equal(classify({ ...base, tool_name: 'functions.exec_command' }), '실행');
  assert.equal(classify({ ...base, tool_name: 'functions.update_plan' }), '계획');
});
