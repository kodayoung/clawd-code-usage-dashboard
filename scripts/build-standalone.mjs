import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function dashboardSettings(env) {
  const url = (env.VITE_SUPABASE_URL || '').trim();
  const key = (env.VITE_SUPABASE_KEY || '').trim();
  const missing = !url || !key || url.includes('your-project') || key.startsWith('your-');

  // Only public browser keys can be bundled. Never include uploader credentials.
  if (key && !key.startsWith('your-')) {
    let publicKey = key.startsWith('sb_publishable_');
    if (!publicKey) {
      try {
        const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
        publicKey = key.split('.').length === 3 && payload.role === 'anon';
      } catch { /* A malformed or private key is rejected below. */ }
    }
    if (key.startsWith('sb_secret_') || !publicKey) {
      throw new Error('VITE_SUPABASE_KEY에는 공개 anon 또는 sb_publishable_ 키만 사용할 수 있습니다. HTML은 변경하지 않았습니다.');
    }
  }
  if (!missing) {
    let validUrl = false;
    try { validUrl = ['http:', 'https:'].includes(new URL(url).protocol); } catch { /* Invalid URL. */ }
    if (!validUrl) throw new Error('VITE_SUPABASE_URL에 올바른 http(s) 주소를 설정하세요. HTML은 변경하지 않았습니다.');
  }
  return missing ? { url: '', key: '', configured: false } : { url, key, configured: true };
}

export function standaloneHtml(js, css) {
  // HTML parses closing tags before JavaScript/CSS, even inside quoted strings.
  const escapeClosingTag = tag => tag.replace('/', '\\/');
  const safeJs = js.replace(/<\/script/gi, escapeClosingTag).replace(/<!--/g, '<\\!--')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g,
      char => `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`);
  const safeCss = css.replace(/<\/style/gi, escapeClosingTag);
  return `<!DOCTYPE html>
<!-- Generated from src/ by npm run build:standalone. -->
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude Code · Codex 사용량 대시보드</title>
<style>${safeCss}</style>
</head>
<body>
<div id="root"><main style="padding:48px;font-family:system-ui,sans-serif">대시보드를 불러오는 중입니다…</main></div>
<noscript><p>브라우저에서 JavaScript를 허용한 뒤 새로고침해 주세요.</p></noscript>
<script>${safeJs}</script>
</body>
</html>
`;
}

export async function buildStandalone() {
  const settings = dashboardSettings(loadEnv('production', projectRoot, ['VITE_SUPABASE_URL', 'VITE_SUPABASE_KEY']));
  const result = await build({
    root: projectRoot,
    configFile: false,
    envFile: false,
    plugins: [react()],
    esbuild: { supported: { 'template-literal': false } },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(settings.url),
      'import.meta.env.VITE_SUPABASE_KEY': JSON.stringify(settings.key),
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    build: {
      write: false,
      cssCodeSplit: false,
      minify: 'esbuild',
      lib: { entry: resolve(projectRoot, 'src/main.jsx'), name: 'UsageDashboard', formats: ['iife'] },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  const output = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
  const chunks = output.filter(item => item.type === 'chunk');
  const css = output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css'));
  if (chunks.length !== 1 || chunks[0].imports.length || chunks[0].dynamicImports.length || output.length !== chunks.length + css.length) {
    throw new Error('단일 HTML로 묶을 수 없는 파일이 생성되었습니다. HTML은 변경하지 않았습니다.');
  }
  const html = standaloneHtml(chunks[0].code, css.map(item => String(item.source)).join('\n'));
  await writeFile(resolve(projectRoot, 'index.html'), html, 'utf8');
  console.log('index.html 생성 완료 — 브라우저에서 직접 열 수 있습니다.');
  if (!settings.configured) console.log('Supabase 설정이 필요합니다. .env에 두 VITE_SUPABASE 값을 입력하고 다시 생성하세요.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildStandalone();
}
