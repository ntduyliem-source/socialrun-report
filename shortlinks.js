import {shortlinkPeriod, shortlinkSlugs} from './shortlinks-model.js?v=1';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number = value => Number(value || 0).toLocaleString('vi-VN');
const date = value => value?.split('-').reverse().join('/') || '—';
const shift = (value, days) => {const result = new Date(value + 'T00:00:00Z'); result.setUTCDate(result.getUTCDate() + days); return result.toISOString().slice(0, 10);};
const empty = message => `<div class="empty">${escape(message)}</div>`;

function name(value, kind) {
  if (value === '__other__') return 'Khác';
  if (!value) return kind === 'referrers' ? 'Trực tiếp / không xác định' : 'Không xác định';
  if (kind === 'countries') {
    try {return new Intl.DisplayNames(['vi'], {type:'region'}).of(value) || value;} catch {return value;}
  }
  return value;
}

function breakdown(title, rows, kind) {
  const max = Math.max(1, ...rows.map(row => row.clicks));
  return `<section class="section shortlinks-breakdown"><div class="section-heading"><h2>${title}</h2></div>` +
    (rows.length ? rows.map(row => `<div class="shortlinks-dimension"><span>${escape(name(row.name, kind))}</span><b>${number(row.clicks)}</b>` +
      `<i style="--traffic-width:${row.clicks / max * 100}%" aria-hidden="true"></i></div>`).join('') : empty('Chưa ghi nhận lượt truy cập.')) + '</section>';
}

export function createShortlinksReport(getSnapshot, displayZone = () => 'America/Halifax') {
  let initialized = false;
  function render() {
    const snapshot = getSnapshot();
    const results = $('shortlinks-results');
    const states = {unconfigured: 'Chưa kết nối dịch vụ Shortlinks.', unavailable: 'Chưa tải được số liệu Shortlinks. Hệ thống sẽ tự thử lại.'};
    if (!snapshot?.totals) {results.innerHTML = empty(states[snapshot?.state] || 'Đang chờ đồng bộ số liệu Shortlinks.'); return;}
    if (!initialized) {$('shortlinks-start').value = snapshot.start; $('shortlinks-end').value = snapshot.end; initialized = true;}
    const selected = $('shortlinks-slug').value;
    $('shortlinks-slug').innerHTML = '<option value="">Tất cả link</option>' + shortlinkSlugs(snapshot)
      .map(slug => `<option value="${escape(slug)}">/${escape(slug)}</option>`).join('');
    $('shortlinks-slug').value = selected;
    let data;
    try {data = shortlinkPeriod(snapshot, {start: $('shortlinks-start').value, end: $('shortlinks-end').value, slug: $('shortlinks-slug').value});}
    catch (error) {results.innerHTML = `<p class="error" role="alert">${escape(error.message)}</p>`; return;}
    if (!data) {results.innerHTML = empty('Chưa có số liệu phù hợp.'); return;}
    const status = data.stale ? 'Đang hiển thị bản gần nhất; lần đồng bộ mới chưa thành công.'
      : !data.complete ? 'Khoảng này còn thiếu dữ liệu hoặc có chi tiết traffic chưa đồng bộ đủ.' : '';
    const metric = (label, value) => `<article class="metric"><span class="metric-label">${label}</span><strong class="metric-number">${number(value)}</strong></article>`;
    const updated = data.updatedAt ? new Date(data.updatedAt).toLocaleString('vi-VN', {timeZone:displayZone()}) : '—';
    const max = Math.max(1, ...data.timeline.map(row => row.clicks));
    results.innerHTML = `<p class="section-note">${escape(date(data.start))} – ${escape(date(data.end))} · America/Halifax` +
      ` · Cập nhật ${escape(updated)} (${escape(displayZone())})</p>` + (status ? `<p class="error" role="status">${escape(status)}</p>` : '') +
      `<p class="section-note">Dữ liệu ghi nhận: ${escape(date(data.recordingStart))} – ${escape(date(data.recordingEnd))}.</p>` +
      `<section class="summary shortlinks-summary">${metric('Click', data.totals.clicks)}${metric('Link có click', data.totals.links)}${metric('Bot / preview', data.totals.automated)}</section>` +
      `<section class="section"><div class="section-heading"><h2>Click theo ngày</h2><span class="section-note">Đã tách bot / preview</span></div>` +
      (data.timeline.length ? '<div class="shortlinks-timeline">' + data.timeline.map(row => `<div title="${escape(date(row.day))}: ${number(row.clicks)} click"><b>${number(row.clicks)}</b>` +
        `<i style="--traffic-height:${Math.max(1, row.clicks / max * 100)}%"></i><small>${escape(row.day.slice(5))}</small></div>`).join('') + '</div>' : empty('Khoảng ngày này chưa ghi nhận click.')) + '</section>' +
      `<div class="shortlinks-breakdowns">${breakdown('Nguồn truy cập', data.referrers, 'referrers')}${breakdown('Quốc gia', data.countries, 'countries')}${breakdown('Thiết bị', data.devices, 'devices')}</div>` +
      `<section class="section"><div class="section-heading"><h2>Traffic theo link <span class="count">${number(data.links.length)}</span></h2></div>` +
      (data.links.length ? '<div class="report-table"><table><thead><tr><th>Shortlink</th><th>Click</th></tr></thead><tbody>' +
        data.links.map(row => `<tr><td><button type="button" class="text-button" data-shortlink-slug="${escape(row.slug)}">/${escape(row.slug)}</button></td><td>${number(row.clicks)}</td></tr>`).join('') +
        '</tbody></table></div><p class="section-note">Bấm tên link để xem riêng nguồn truy cập, quốc gia và thiết bị.</p>' : empty('Không có link phát sinh click trong bộ lọc.')) + '</section>';
  }
  for (const id of ['shortlinks-start','shortlinks-end','shortlinks-slug']) $(id).addEventListener('change', render);
  $('shortlinks-results').addEventListener('click', event => {
    const link = event.target.closest('[data-shortlink-slug]');
    if (link) {$('shortlinks-slug').value = link.dataset.shortlinkSlug; render();}
  });
  $('shortlinks-clear').addEventListener('click', () => {initialized = false; $('shortlinks-slug').value = ''; render();});
  for (const button of document.querySelectorAll('[data-shortlinks-days]')) button.addEventListener('click', () => {
    const end = getSnapshot()?.end;
    if (!end) return;
    $('shortlinks-end').value = end; $('shortlinks-start').value = shift(end, 1 - Number(button.dataset.shortlinksDays)); render();
  });
  return {render};
}
