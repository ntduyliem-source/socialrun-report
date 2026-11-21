const countryNames = new Intl.DisplayNames(['vi'], {type: 'region'});
const devices = {desktop: 'Máy tính', mobile: 'Điện thoại', tablet: 'Máy tính bảng'};

function publicLink(base, slug) {
  try {
    const url = new URL(base);
    return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/'
      ? url.origin + '/' + encodeURIComponent(slug) : '';
  } catch { return ''; }
}

function sumBreakdowns(parts, key) {
  const counts = new Map();
  for (const part of parts) {
    for (const {name, clicks} of part[key] || []) counts.set(name, (counts.get(name) || 0) + clicks);
  }
  return [...counts].map(([name, clicks]) => ({name, clicks})).sort((a, b) => b.clicks - a.clicks || a.name.localeCompare(b.name));
}

function intervalTraffic(snapshot, start, end) {
  const days = snapshot.daily.filter(day => start <= day.day && day.day <= end);
  const linkDays = new Map();
  for (const day of days) {
    for (const item of day.links) {
      const rows = linkDays.get(item.slug) || [];
      rows.push({...item, day: day.day});
      linkDays.set(item.slug, rows);
    }
  }
  const dimensions = ['referrers', 'countries', 'devices'];
  const totalOf = (items, value) => items.reduce((sum, row) => sum + value(row), 0);
  const links = [...linkDays].map(([slug, items]) => {
    const summary = {slug, clicks: totalOf(items, item => item.clicks)};
    if (items.some(item => !item.referrers)) return summary;
    return {...summary, ...Object.fromEntries(dimensions.map(key => [key, sumBreakdowns(items, key)])),
      timeline: items.map(({day, clicks}) => ({day, clicks}))};
  });
  const countries = sumBreakdowns(days, 'countries');
  const totals = {clicks: totalOf(days, day => day.totals.clicks), automated: totalOf(days, day => day.totals.automated),
    links: links.length, countries: countries.filter(row => row.name && row.name !== '__other__').length};
  return {publicBaseUrl: snapshot.publicBaseUrl, totals, links, countries,
    countriesGrouped: countries.some(row => row.name === '__other__'),
    timeline: days.map(day => ({day: day.day, clicks: day.totals.clicks})),
    referrers: sumBreakdowns(days, 'referrers'), devices: sumBreakdowns(days, 'devices'),
    partial: days.some(day => day.state !== 'ready')};
}

function offsetDate(day, numberOfDays) {
  const value = new Date(day + 'T00:00:00Z');
  value.setUTCDate(value.getUTCDate() + numberOfDays);
  return value.toISOString().slice(0, 10);
}

export function mountShortlinks(root, {escape, n, metric, reportDate}) {
  const el = id => root.querySelector('#shortlinks-' + id);
  const sortButtons = [...root.querySelectorAll('[data-traffic-sort]')];
  const presets = [...root.querySelectorAll('[data-traffic-days]')];
  let data, selected = '', sort = 'clicks', descending = true;
  let snapshot, zone, preset = '30';
  let revision;

  const name = {
    referrers: value => value || 'Trực tiếp / nguồn ẩn',
    countries: value => value ? (countryNames.of(value) || value) : 'Không rõ',
    devices: value => devices[value] || value || 'Không rõ',
    timeline: value => reportDate(value),
  };
  function breakdown(heading, key, rows) {
    let body = rows.map(row => `<tr><th scope="row">${escape(row.name === '__other__' ? 'Khác' : name[key](key === 'timeline' ? row.day : row.name))}</th>` +
      `<td>${n(row.clicks)}</td></tr>`).join('');
    if (!body) body = '<tr><td colspan="2">Chưa ghi nhận click</td></tr>';
    return `<section class="shortlinks-breakdown"><h3>${heading}</h3><div class="report-table"><table>` +
      '<thead class="sr-only"><tr><th scope="col">Giá trị</th><th scope="col">Click</th></tr></thead>' +
      `<tbody>${body}</tbody></table></div></section>`;
  }

  function renderDetails() {
    const traffic = data.links.find(link => link.slug === selected) || data;
    const specific = traffic !== data;
    el('traffic-title').textContent = specific ? '/' + traffic.slug : 'Nguồn và thời gian';
    el('clear').hidden = !specific;
    for (const button of el('rows').querySelectorAll('[data-traffic-slug]')) {
      button.setAttribute('aria-pressed', String(button.dataset.trafficSlug === selected));
    }
    const url = specific && publicLink(data.publicBaseUrl, traffic.slug);
    const heading = specific ? `<p class="shortlinks-selected"><strong>${n(traffic.clicks)} click</strong>` +
      (url ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">Mở shortlink ↗</a>` : '') + '</p>' : '';
    if (!traffic.referrers) {
      el('breakdowns').innerHTML = heading + '<p class="section-note">Chi tiết link đang chờ đồng bộ.</p>';
      return;
    }
    const tables = breakdown('Nguồn truy cập', 'referrers', traffic.referrers) +
      breakdown('Quốc gia', 'countries', traffic.countries) + breakdown('Thiết bị', 'devices', traffic.devices) +
      breakdown('Click theo ngày', 'timeline', [...traffic.timeline].sort((a, b) => b.day.localeCompare(a.day)));
    el('breakdowns').innerHTML = heading + `<div class="shortlinks-breakdown-grid">${tables}</div>`;
  }

  function renderList() {
    const query = el('search').value.trim().toLowerCase();
    const rows = data.links.filter(link => link.slug.toLowerCase().includes(query));
    rows.sort((a, b) => {
      const compared = sort === 'clicks' ? a.clicks - b.clicks : a.slug.localeCompare(b.slug);
      return (descending ? -compared : compared) || a.slug.localeCompare(b.slug);
    });
    for (const button of sortButtons) {
      const direction = button.dataset.trafficSort !== sort ? 'none' : descending ? 'descending' : 'ascending';
      button.closest('th').setAttribute('aria-sort', direction);
    }
    el('count').textContent = n(rows.length);
    el('rows').innerHTML = rows.map(row => `<tr><td><button class="text-button shortlinks-row" type="button" ` +
      `data-traffic-slug="${escape(row.slug)}" aria-pressed="${row.slug === selected}">/${escape(row.slug)}</button></td>` +
      `<td>${n(row.clicks)}</td></tr>`).join('') || '<tr><td colspan="2">Không có link phù hợp.</td></tr>';
  }

  el('search').addEventListener('input', renderList);
  for (const button of sortButtons) button.addEventListener('click', () => {
    const field = button.dataset.trafficSort;
    descending = field === sort ? !descending : field === 'clicks';
    sort = field;
    renderList();
  });
  el('rows').addEventListener('click', event => {
    const control = event.target.closest('[data-traffic-slug]');
    if (!control) return;
    selected = control.dataset.trafficSlug;
    renderDetails();
    if (matchMedia('(max-width: 760px)').matches) el('traffic-title').focus();
  });
  el('clear').addEventListener('click', () => { selected = ''; renderDetails(); el('search').focus(); });

  function chooseInterval() {
    const first = snapshot.recordingStart, last = snapshot.end;
    for (const id of ['start', 'end']) {
      el(id).min = first;
      el(id).max = last;
    }
    if (preset) {
      const beginning = preset === 'all' ? first : offsetDate(last, 1 - Number(preset));
      el('start').value = beginning < first ? first : beginning;
      el('end').value = last;
    }
    for (const button of presets) {
      const active = button.dataset.trafficDays === preset;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  function renderTraffic() {
    const status = el('status');
    el('data').hidden = !snapshot?.totals;
    if (!snapshot?.totals) {
      status.textContent = ({unconfigured: 'Chưa kết nối Sink.', unavailable: 'Sink chưa trả số liệu traffic.'})[snapshot?.state]
        || 'Đang chờ đồng bộ số liệu Shortlinks.';
      return;
    }
    const dated = Array.isArray(snapshot.daily);
    el('date-window').hidden = !dated;
    const start = dated ? el('start').value || snapshot.recordingStart : snapshot.start;
    const end = dated ? el('end').value || snapshot.end : snapshot.end;
    const error = el('date-error');
    const outside = dated && (start < snapshot.recordingStart || end > snapshot.end);
    error.hidden = !outside && start <= end;
    error.textContent = outside ? 'Chọn ngày trong khoảng có dữ liệu.' : 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.';
    el('results').hidden = !error.hidden;
    if (!error.hidden) return;

    data = dated ? intervalTraffic(snapshot, start, end) : snapshot;
    const updated = new Intl.DateTimeFormat('vi-VN', {dateStyle: 'short', timeStyle: 'short', timeZone: zone})
      .format(new Date(snapshot.updatedAt));
    const note = snapshot.state === 'stale' ? ' · Đang dùng số liệu gần nhất' :
      (data.partial || !dated && snapshot.state === 'partial') ? ' · Một số link đang chờ chi tiết' : '';
    status.textContent = `${reportDate(start)} – ${reportDate(end)} (Halifax) · Cập nhật ${updated}${note}` +
      (dated ? '' : ' · Đang đồng bộ bộ lọc ngày');
    const countryCount = n(data.totals.countries) + (data.countriesGrouped ? '+' : '');
    el('summary').innerHTML = metric('LƯỢT CLICK', n(data.totals.clicks), 'Lượt truy cập') +
      metric('LINK CÓ CLICK', n(data.totals.links), 'Trong khoảng đã chọn') +
      metric('QUỐC GIA', countryCount, 'Theo số liệu Sink') +
      metric('BOT / PREVIEW', n(data.totals.automated), 'Tách riêng khỏi lượt click');
    if (!data.links.some(link => link.slug === selected)) selected = '';
    renderList();
    renderDetails();
  }

  for (const id of ['start', 'end']) el(id).addEventListener('change', () => {
    preset = '';
    chooseInterval();
    renderTraffic();
  });
  for (const button of presets) button.addEventListener('click', () => {
    preset = button.dataset.trafficDays;
    chooseInterval();
    renderTraffic();
  });

  return (current, displayZone) => {
    const version = [current?.state, current?.updatedAt, displayZone].join('|');
    if (revision === version) return;
    revision = version;
    snapshot = current;
    zone = displayZone;
    if (Array.isArray(snapshot?.daily)) chooseInterval();
    renderTraffic();
  };
}
