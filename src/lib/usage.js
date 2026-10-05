export const SOURCE_LABELS = { claude: 'Claude Code', codex: 'Codex' };

export const sourceOf = row => row.source || 'claude';
export const isToolCall = row => row.record_type !== 'usage';
export const sessionKey = row => JSON.stringify([sourceOf(row), row.device_id, row.session_id]);
export const filterSource = (rows, source) => source ? rows.filter(r => sourceOf(r) === source) : rows;
