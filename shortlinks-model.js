const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const dimensions = ['referrers', 'countries', 'devices'];

function mergeRows(parts, key, identity = 'name') {
  const rows = new Map();
  for (const part of parts) for (const row of part[key] ?? []) {
    const name = row[identity];
    if (typeof name !== 'string') continue;
    const current = rows.get(name) ?? {[identity]: name, clicks: 0, ...(key === 'timeline' ? {automated: 0} : {})};
    current.clicks += count(row.clicks);
    if (key === 'timeline') current.automated += count(row.automated);
    rows.set(name, current);
  }
  return [...rows.values()].sort((a, b) => key === 'timeline'
    ? a.day.localeCompare(b.day) : b.clicks - a.clicks || a[identity].localeCompare(b[identity]));
}

function merge(parts) {
  const links = new Map();
  for (const part of parts) for (const row of part.links ?? []) {
    if (!links.has(row.slug)) links.set(row.slug, []);
    links.get(row.slug).push(row);
  }
  return {
    totals: {clicks: parts.reduce((sum, part) => sum + count(part.totals?.clicks), 0),
      automated: parts.reduce((sum, part) => sum + count(part.totals?.automated), 0), links: links.size},
    links: [...links].map(([slug, rows]) => ({slug, clicks: rows.reduce((sum, row) => sum + count(row.clicks), 0),
      timeline: mergeRows(rows, 'timeline', 'day'), ...Object.fromEntries(dimensions.map(key => [key, mergeRows(rows, key)])),
      complete: rows.every(row => dimensions.every(key => Array.isArray(row[key])))}))
      .sort((a, b) => b.clicks - a.clicks || a.slug.localeCompare(b.slug)),
    timeline: mergeRows(parts, 'timeline', 'day'), ...Object.fromEntries(dimensions.map(key => [key, mergeRows(parts, key)])),
  };
}

export function shortlinkSlugs(snapshot) {
  return [...new Set([...(snapshot?.links ?? []), ...(snapshot?.daily ?? []).flatMap(row => row.links ?? [])]
    .map(row => row.slug).filter(slug => typeof slug === 'string'))].sort();
}

export function shortlinkPeriod(snapshot, {start, end, slug = ''} = {}) {
  if (!snapshot?.totals || !day(snapshot.start) || !day(snapshot.end)) return null;
  const from = start || snapshot.start, to = end || snapshot.end;
  if (!day(from) || !day(to) || from > to) throw Error('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  const ranged = from !== snapshot.start || to !== snapshot.end;
  const parts = ranged ? (snapshot.daily ?? []).filter(row => from <= row.day && row.day <= to) : [snapshot];
  let data = merge(parts);
  let complete = (ranged ? Array.isArray(snapshot.daily) && parts.every(row => row.state === 'ready')
    : snapshot.state === 'ready') && (!ranged || from >= (snapshot.recordingStart || snapshot.start)) && to <= snapshot.end;
  if (slug) {
    const row = data.links.find(row => row.slug === slug);
    complete &&= !row || row.complete;
    data = {totals: {clicks: row?.clicks ?? 0, links: row ? 1 : 0,
      automated: (row?.timeline ?? []).reduce((sum, item) => sum + item.automated, 0)},
      links: row ? [row] : [], timeline: row?.timeline ?? [],
      ...Object.fromEntries(dimensions.map(key => [key, row?.[key] ?? []]))};
  }
  return {...data, start: from, end: to, slug, complete, stale: snapshot.state === 'stale',
    recordingStart: snapshot.recordingStart || snapshot.start, recordingEnd: snapshot.end, updatedAt: snapshot.updatedAt};
}
