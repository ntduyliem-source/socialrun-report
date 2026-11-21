const countryNames = new Intl.DisplayNames(['vi'], {type: 'region'});
const devices = {desktop: 'Máy tính', mobile: 'Điện thoại', tablet: 'Máy tính bảng'};

function publicLink(base, slug) {
  try {
    const url = new URL(base);
    return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/'
      ? url.origin + '/' + encodeURIComponent(slug) : '';
  } catch { return ''; }
}

export function mountShortlinks(root, {escape, n, metric, reportDate}) {
  const el = id => root.querySelector('#shortlinks-' + id);
  const sortButtons = [...root.querySelectorAll('[data-traffic-sort]')];
  let data, selected = '', sort = 'clicks', descending = true;
  let revision;

  const name = {
    referrers: value => value || 'Trực tiếp / nguồn ẩn',
    countries: value => value ? (countryNames.of(value) || value) : 'Không rõ',
    devices: value => devices[value] || value || 'Không rõ',
    timeline: value => reportDate(value),
  };
  function breakdown(heading, key, rows) {
    let body = rows.map(row => `<tr><th scope="row">${escape(name[key](key === 'timeline' ? row.day : row.name))}</th>` +
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

  return (snapshot, zone) => {
    const version = [snapshot?.state, snapshot?.updatedAt, zone].join('|');
    if (revision === version) return;
    revision = version;
    data = snapshot;
    el('data').hidden = !data?.totals;
    const status = el('status');
    if (!data?.totals) {
      status.textContent = ({unconfigured: 'Chưa kết nối Sink.', unavailable: 'Sink chưa trả số liệu traffic.'})[data?.state]
        || 'Đang chờ đồng bộ số liệu Shortlinks.';
      return;
    }
    const updated = new Intl.DateTimeFormat('vi-VN', {dateStyle: 'short', timeStyle: 'short', timeZone: zone})
      .format(new Date(data.updatedAt));
    const state = {stale: ' · Đang dùng số liệu gần nhất', partial: ' · Một số link đang chờ chi tiết'}[data.state] || '';
    status.textContent = `${reportDate(data.start)} – ${reportDate(data.end)} (Halifax) · Cập nhật ${updated}${state}`;
    el('summary').innerHTML = metric('LƯỢT CLICK', n(data.totals.clicks), 'Lượt truy cập') +
      metric('LINK CÓ CLICK', n(data.totals.links), 'Trong 30 ngày') +
      metric('QUỐC GIA', n(data.totals.countries), 'Theo số liệu Sink') +
      metric('BOT / PREVIEW', n(data.totals.automated), 'Tách riêng khỏi lượt click');
    if (!data.links.some(link => link.slug === selected)) selected = '';
    renderList();
    renderDetails();
  };
}
