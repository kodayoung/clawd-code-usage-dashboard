import { useEffect, useState } from 'react';
import { load } from '../lib/cache.js';

export function useUsageData() {
  const [rows, setRows] = useState([]);
  const [lastUpdated, setLastUpdated] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { rows, note } = await load();
        if (!alive) return;
        setRows(rows);
        setLastUpdated(`마지막 업데이트: ${new Date().toLocaleString('ko-KR')} · ${note}`);
      } catch (e) {
        if (alive) {
          const message = typeof e === 'string' ? e : e?.message;
          setError(message || '데이터를 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 열어 주세요.');
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return { rows, lastUpdated, loading, error };
}
