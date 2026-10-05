import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { dashboardSettings, standaloneHtml } from './build-standalone.mjs';

const url = 'https://example.supabase.co';
const jwt = role => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;

test('only the public dashboard URL and key are returned', () => {
  for (const key of ['sb_publishable_example', jwt('anon')]) {
    assert.deepEqual(dashboardSettings({
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_KEY: key,
      SUPABASE_SECRET_KEY: 'must-never-be-bundled',
      VITE_UNRELATED_SECRET: 'must-never-be-bundled',
    }), { url, key, configured: true });
  }
});

test('privileged and unrecognized keys are rejected, even when the URL is missing', () => {
  for (const key of ['sb_secret_example', jwt('service_role'), jwt('authenticated'), 'unknown-key']) {
    for (const value of [url, '']) {
      assert.throws(() => dashboardSettings({ VITE_SUPABASE_URL: value, VITE_SUPABASE_KEY: key }), /공개 anon/);
    }
  }
});

test('missing or example settings produce the configuration-needed state', () => {
  for (const env of [{}, { VITE_SUPABASE_URL: url }, {
    VITE_SUPABASE_URL: 'https://your-project-id.supabase.co', VITE_SUPABASE_KEY: 'your-anon-key-here',
  }]) {
    assert.deepEqual(dashboardSettings(env), { url: '', key: '', configured: false });
  }
  assert.throws(() => dashboardSettings({ VITE_SUPABASE_URL: 'not-a-url', VITE_SUPABASE_KEY: jwt('anon') }), /올바른/);
});

test('inline script cannot break out of HTML and retains its string values', () => {
  const original = '</ScRiPt><script src="injected.js"><!--\u001f';
  const html = standaloneHtml(`globalThis.result=${JSON.stringify(original).replace('\\u001f', '\u001f')};`, 'a::after{content:"</style>"}');
  assert.equal((html.match(/<\/script>/gi) || []).length, 1);
  assert.equal((html.match(/<\/style>/gi) || []).length, 1);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const context = {};
  runInNewContext(script, context);
  assert.equal(context.result, original);
  assert.doesNotMatch(html, /\u001f/);
  assert.doesNotMatch(html.replace(/<script>[\s\S]*?<\/script>/, ''), /type="module"|<link\b|<script\s+src=/i);
});
