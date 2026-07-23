// Supabase 크레덴셜은 Vite 환경변수(VITE_ prefix)에서 읽는다.
// 로컬: 프로젝트 루트 .env 에 VITE_SUPABASE_URL / VITE_SUPABASE_KEY 설정
// 배포: Vercel Project Settings → Environment Variables 에 동일 키 등록
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || '';

// 차트 공통 팔레트 (기존 dashboard.html COLORS와 동일)
export const COLORS = ['#7c6eff','#ff6eb4','#45d9a1','#ffb545','#60c4ff','#ff8c60','#c4e060','#d060c4','#60d4d4','#ffd460'];

export function isConfigured() {
  return !!SUPABASE_URL && !!SUPABASE_KEY && !SUPABASE_URL.includes('your-project');
}
