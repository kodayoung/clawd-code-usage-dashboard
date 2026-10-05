import { db } from './supabase.js';

// ── IndexedDB 캐시 ──
// 받은 행을 브라우저에 저장해 두고, 다음 로드부터는 신규 행만 내려받아 egress를 절감한다.
const IDB_NAME = 'usage-dashboard-cache-v2'; // source/record_type 추가 후 기존 행도 다시 받는다
const IDB_STORE = 'tool_calls';

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('브라우저 캐시를 열 수 없습니다.'));
  });
}

function idbGetAll(idb) {
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE);
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error || new Error('브라우저 캐시를 읽을 수 없습니다.'));
    tx.onabort = () => reject(tx.error || new Error('브라우저 캐시 읽기가 중단되었습니다.'));
  });
}

function idbPutAll(idb, rows, clearFirst) {
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    if (clearFirst) store.clear();
    rows.forEach(r => store.put(r));
    tx.oncomplete = () => resolve();
    tx.onerror = event => reject(tx.error || event.target?.error || new Error('브라우저 캐시에 저장할 수 없습니다.'));
    tx.onabort = () => reject(tx.error || new Error('브라우저 캐시 저장이 중단되었습니다.'));
  });
}

// PostgREST는 한 요청당 기본 1000행으로 잘라내므로 range로 끝까지 페이지네이션.
// sinceCreatedAt을 주면 그 시각 이후 행만 가져온다.
async function fetchRows(sinceCreatedAt) {
  const PAGE = 1000;
  const cols = 'id,created_at,device_id,source,record_type,event_id,session_id,timestamp,tool_category,tool_name,skill_name,mcp_server,mcp_tool,subagent_type,project_name,model,input_tokens,output_tokens,reasoning_output_tokens,cache_creation_tokens,cache_read_tokens';
  let all = [], from = 0;
  while (true) {
    let q = db.from('tool_calls')
      .select(cols)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (sinceCreatedAt) q = q.gte('created_at', sinceCreatedAt);
    const { data, error } = await q;
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function serverCount() {
  const { count, error } = await db.from('tool_calls').select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

// 데이터 로드 — 증분 캐시 로직. { rows, note } 반환.
export async function load() {
  if (!db) throw new Error('Supabase 미설정');

  // IndexedDB를 못 쓰는 환경(일부 file:// 제한 등)에서는 캐시 없이 전체 로드로 동작
  let idb = null, cached = [];
  try {
    idb = await idbOpen();
    cached = await idbGetAll(idb);
  } catch {
    idb?.close();
    idb = null;
    cached = [];
  }

  // 캐시는 선택 사항이다. 저장 실패가 성공한 데이터 조회를 막지 않게 한다.
  let cacheWriteFailed = false;
  async function persist(rows, clearFirst) {
    if (!idb) return;
    try {
      await idbPutAll(idb, rows, clearFirst);
    } catch {
      cacheWriteFailed = true;
      idb.close();
      idb = null;
    }
  }

  try {
    const total = await serverCount();
    let allData, note;
    if (cached.length === 0) {
      allData = await fetchRows(null);
      await persist(allData, true);
      note = `전체 ${allData.length.toLocaleString()}행 로드`;
    } else {
      // 신규 행만 내려받기 — 동시 업로드 트랜잭션 순서로 빠지는 행이 없도록
      // 커서보다 5분 앞에서부터 겹쳐 받고 id로 중복 제거한다.
      const cursor = cached.reduce((m, r) => (r.created_at > m ? r.created_at : m), cached[0].created_at);
      const since = new Date(new Date(cursor).getTime() - 5 * 60000).toISOString();
      const fresh = await fetchRows(since);
      const byId = new Map(cached.map(r => [r.id, r]));
      fresh.forEach(r => byId.set(r.id, r));
      let merged = [...byId.values()];
      if (merged.length !== total) {
        // 서버 쪽 삭제/재업로드(TRUNCATE 등)로 캐시와 어긋남 → 캐시 재구축
        merged = await fetchRows(null);
        await persist(merged, true);
        note = `서버 변경 감지 → 전체 ${merged.length.toLocaleString()}행 재로드`;
      } else {
        if (fresh.length) await persist(fresh, false);
        note = `캐시 ${cached.length.toLocaleString()}행 + 신규 ${(merged.length - cached.length).toLocaleString()}행`;
      }
      allData = merged;
    }
    allData.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
    if (cacheWriteFailed) note += ' · 브라우저 캐시 저장 실패, 데이터 조회는 완료';
    return { rows: allData, note };
  } finally {
    idb?.close();
  }
}
