import {LABELS,PLAN_LABELS,tasksFor,summary,filtered,tone,taskLabel,ZAZZLE_STATES,zazzlePeriod,SALE_STATES,zazzleSales} from './model.js?v=5';
import {mountShortlinks} from './shortlinks.js?v=1';
const $=id=>document.getElementById(id), escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let report=null,config=null,busy=false,filter='all',fetchFailed=false;
let zazzleView = location.hash === '#zazzle-check-sale' ? 'sales' : 'overview', salesPage = 1;
const reportTabs = ['facebook', 'zazzle', 'shortlinks'];
let activeTab = 'facebook';
try { const saved=localStorage.getItem('socialrun-report-timezone');$('timezone').value=['Asia/Ho_Chi_Minh','America/Halifax'].includes(saved)?saved:'Asia/Ho_Chi_Minh'; } catch {}
const zone=()=>$('timezone').value, fmt=(at,options={})=>at?new Intl.DateTimeFormat('vi-VN',{timeZone:zone(),...options}).format(new Date(at)):'—';
const clock=at=>fmt(at,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}), date=at=>fmt(at,{day:'2-digit',month:'2-digit'}), full=at=>fmt(at,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const n=value=>Number(value||0).toLocaleString('vi-VN'), badge=task=>`<span class="badge ${tone(task.state)}">${escape(taskLabel(task))}</span>`;
const empty=message=>`<div class="empty">${escape(message)}</div>`;
function setOptions(el,items,defaultLabel) {
  const previous=el.value;
  el.innerHTML=(defaultLabel?`<option value="">${escape(defaultLabel)}</option>`:'')+items.map(([value,label])=>`<option value="${escape(value)}">${escape(label)}</option>`).join('');
  if([...el.options].some(o=>o.value===previous)) el.value=previous;
}
function syncStatus() {
  if(!report)return;
  const age=Math.max(0,(Date.now()-new Date(report.generatedAt).getTime())/1000),stale=age>(report.staleAfterSeconds||900)||report.sourceOnline===false,el=$('sync');
  el.className=`sync ${stale||fetchFailed?'stale':'live'}`;
  el.innerHTML=`<span class="sync-dot"></span><span>${report.sourceOnline===false?'SocialRun đang tắt; giữ kết quả gần nhất':stale?'Đã lâu chưa có bản cập nhật':fetchFailed?'Đang giữ bản cập nhật gần nhất':'Đã đồng bộ'} · ${escape(full(report.generatedAt))}${age>60?` · ${n(Math.floor(age/60))} phút trước`:''}</span>`;
  $('snapshot-time').textContent=`Bản cập nhật ${full(report.generatedAt)}`;
}
function metric(label,value,hint,extra='') {return `<div class="metric ${extra}"><div class="metric-label">${label}</div><div class="metric-number">${value}</div><div class="metric-hint">${hint}</div></div>`;}
function renderEmployees(day) {
  const employees=[...(day?.employees??[])].sort((a,b)=>(a.tasks[0]?.scheduledAt||'').localeCompare(b.tasks[0]?.scheduledAt||'')||a.employee.localeCompare(b.employee));
  $('employee-count').textContent=n(employees.length);
  $('employees').innerHTML=employees.length?employees.map(employee=>{
    const stats=summary(employee.tasks),roles=[...new Set(employee.tasks.map(t=>t.role))],next=employee.tasks.find(t=>t.state==='running')||employee.tasks.find(t=>t.state==='pending'),initials=employee.employee.split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase();
    const label=employee.state==='completed'&&stats.done<stats.total?'Đã kết thúc · còn lượt chưa xong':PLAN_LABELS[employee.state]||'Cần kiểm tra';
    return `<article class="employee"><div class="employee-top"><span class="initials">${escape(initials)}</span><div><div class="employee-name">${escape(employee.employee)}</div><div class="employee-roles">${escape(roles.join(' · '))}</div></div><div class="employee-progress">${n(stats.done)}<small>/${n(stats.total)}</small></div></div><div class="progress-track" role="progressbar" aria-label="Tiến độ ${escape(employee.employee)}" aria-valuenow="${stats.done}" aria-valuemin="0" aria-valuemax="${stats.total}"><span style="width:${stats.total?stats.done/stats.total*100:0}%"></span></div><div class="employee-bottom"><span class="badge ${stats.attention?'warm':employee.state==='running'?'running':employee.state==='completed'&&stats.done===stats.total?'good':''}">${escape(label)}</span><span>${stats.invited?`${n(stats.invited)} lời mời`:stats.attention?`${n(stats.attention)} lượt cần xem`:stats.approval?`${n(stats.approval)} chờ duyệt`:'Đã xác nhận '+n(stats.done)+' lượt'}</span></div>${next?`<div class="employee-next"><b>${next.state==='running'?'Đang chạy':'Tiếp theo'} · ${escape(clock(next.scheduledAt))}</b> &nbsp;${escape(next.label)}${next.group?' · '+escape(next.group):''}</div>`:''}</article>`;
  }).join(''):empty('Chưa có lịch chạy trong ngày này.');
}
function renderLog(tasks) {
  const filters={employee:$('employee').value,group:$('group').value,action:$('action').value,status:filter},rows=filtered(tasks,filters),opened=new Set([...$('log').querySelectorAll('details[open]')].map(el=>el.dataset.id));
  $('clear').hidden=!filters.employee&&!filters.group&&!filters.action&&filter==='all';
  $('log-count').textContent=rows.length===tasks.length?n(rows.length):`${n(rows.length)}/${n(tasks.length)}`;
  $('log').innerHTML=rows.length?rows.map(t=>{
    const r=t.receipt||{},target=t.group||(t.action==='wall_post'?'Wall':t.action==='story'?'Story':''),invite=r.confirmed&&r.kind==='invitation';
    let note=t.state==='unverified'?'Chưa đủ bằng chứng xác nhận; chương trình giữ lượt này để đối soát.':t.state==='skipped'?'Đã qua khung giờ, chưa thực hiện thành công.':t.state==='failed'?'Lượt chạy có lỗi. Chi tiết chẩn đoán được giữ trên máy chạy.':t.state==='pending_approval'?'Đã gửi bài thành công, đang chờ quản trị viên group duyệt.':t.state==='published'?'Worker đã xác nhận bài được đăng.':t.state==='ignored'?'Lượt này được bỏ qua theo lựa chọn trong lịch.':'';
    if(invite){
      const accepted=r.acceptedSampleCount??(r.acceptedBySample?r.invited-r.verified:0);
      const reconciliation=t.state==='unverified'?' Phần chưa rõ đang chờ đối soát.':'';
      note=`Đã mời ${n(r.invited)} người · ${n(r.verified)} xác minh trực tiếp${accepted?` · ${n(accepted)} theo lô`:''}.${r.queueExhausted?' Đã hết người đủ điều kiện trong các link đã kiểm.':''}${r.shortfall?` Thiếu ${n(r.shortfall)} so với quota.`:''}${reconciliation}`;
    }
    const safeUrl=r.url&&/^https:\/\/www\.facebook\.com\//.test(r.url)?r.url:'';
    return `<details class="log-row" data-id="${escape(t.id)}" data-tone="${tone(t.state)==='running'?'':tone(t.state)}"${opened.has(t.id)?' open':''}><summary><time class="log-time" datetime="${escape(t.scheduledAt)}">${escape(clock(t.scheduledAt))}<small class="log-day">${escape(date(t.scheduledAt))}</small></time><div class="log-main"><div class="log-title">${escape(t.employee)} <span class="log-role">/ ${escape(t.role)}</span></div><div class="log-description">${escape(t.label)}${target?' · '+escape(target):''}${invite?' · '+n(r.invited)+' người':''}</div></div><div class="log-outcome">${badge(t)}<span class="expand-arrow" aria-hidden="true">⌄</span></div></summary><div class="log-detail"><div class="detail-item">Thiết bị<strong>${t.engine==='chrome'?'Chrome':t.engine==='ldplayer'?'LDPlayer':'—'}</strong></div><div class="detail-item">Khung giờ<strong>${escape(clock(t.scheduledAt))} – ${escape(clock(t.endsAt))}</strong></div><div class="detail-item">Số lượng<strong>${n(t.quantity)} ${t.action.startsWith('invite_')?'người':'lượt'}</strong></div><div class="detail-item">Số lần chạy<strong>${n(t.attempts)}</strong></div>${t.attempts?`<div class="detail-item">Ghi nhận gần nhất<strong>${escape(full(t.updatedAt))}</strong></div>`:''}${note?`<p class="detail-note">${escape(note)}</p>`:''}${t.errorCode?`<p class="detail-note">Mã lỗi: ${escape(t.errorCode)}</p>`:''}${safeUrl?`<a class="post-link" href="${escape(safeUrl)}" target="_blank" rel="noopener noreferrer">Xem bài trên Facebook ↗</a>`:''}</div></details>`;
  }).join(''):empty(tasks.length?'Không có lượt nào khớp bộ lọc.':'Ngày này chưa có công việc.');
}
const reportDate = day => day.split('-').reverse().join('/');
const renderShortlinks = mountShortlinks($('shortlinks-view'), {escape, n, metric, reportDate});
const sourceWindow = (first, last) => (first && first !== last ? full(first) + ' – ' : '') + full(last);
const reportCurrency = (cents, currency) => new Intl.NumberFormat('vi-VN', {style:'currency', currency}).format(cents / 100);
function publicAmounts(amounts, covered, unknown = 0) {
  return escape(amounts.length ? amounts.map(row => reportCurrency(row.cents, row.currency)).join(' · ') :
    covered && !unknown ? reportCurrency(0, 'USD') : 'Chưa đủ dữ liệu');
}
function renderZazzleSchedule(data) {
  const {schedule, request} = data ?? {};
  const link = $('zazzle-control-link');
  const repo = config?.repository;
  if (repo && /^[\w.-]+\/[\w.-]+$/.test(repo)) {
    link.href = 'https://github.com/' + repo + '/actions/workflows/zazzle-daily.yml';
    link.hidden = $('zazzle-control-help').hidden = false;
  }
  if (schedule) {
    const text = schedule.enabled && schedule.source === 'worker'
      ? `Tự chạy lúc ${schedule.time} hằng ngày · ${schedule.timezone}${schedule.next ? ' · Tiếp theo ' + schedule.next : ''}`
      : 'Lịch Daily Report tự động đang tắt.';
    $('zazzle-schedule').textContent = text;
  } else {
    $('zazzle-schedule').textContent = 'Đang chờ đồng bộ lịch Daily Report.';
  }
  $('zazzle-request').hidden = !request;
  if (request) {
    const outcomes = {
      applied: request.operation === 'enable-daily' ? 'Đã lưu lịch Daily Report' : 'Đã xác nhận tắt lịch Daily Report',
      queued: ZAZZLE_STATES[request.workerState] || 'Đã đưa Daily Report vào hàng đợi',
      no_accounts: 'Chưa có nick đang hoạt động đã lưu cookie',
      superseded: 'Đã có cài đặt lịch mới hơn',
    };
    $('zazzle-request').textContent = `${outcomes[request.state] || 'Đã nhận lệnh'} · ${full(request.at)}`;
  }
}

function renderZazzleToday(today) {
  if (!today) return '';
  const {day, coverage, sale} = today;
  const title = 'Hôm nay ' + reportDate(day);
  const value = sale.count ? publicAmounts(sale.total, false, sale.unknown_amounts) :
    coverage.observed ? '0 dòng royalty ghi nhận' : 'Chưa có CSV';
  const stamp = coverage.newest_checked_at ? 'CSV tạm tính · ' + sourceWindow(coverage.oldest_checked_at, coverage.newest_checked_at) : 'Chờ worker lấy Earnings History';
  return `<section class="section"><div class="section-heading"><h2>${escape(title)}</h2></div><div class="summary">` +
    metric('Earnings hôm nay', value, escape(stamp) + ` · ${n(coverage.observed)}/${n(coverage.accounts)} nick`) + '</div></section>';
}

function publicComparison(period) {
  if (!period.previous || period.unknown || period.previous.unknown_amounts) return '';
  const delta = new Map(period.total.map(row => [row.currency, row.cents]));
  for (const row of period.previous.total) delta.set(row.currency, (delta.get(row.currency) ?? 0) - row.cents);
  const difference = [...delta].map(([currency, cents]) => (cents > 0 ? '+' : '') + reportCurrency(cents, currency));
  return difference.length ? '<p class="section-note">' + escape('So với ' + reportDate(period.previous.end) + ' · ' + difference.join(' · ')) + '</p>' : '';
}

function renderZazzlePeriod(data, filters) {
  if (!data) return empty('Đang chờ dữ liệu Zazzle từ SocialRun.');
  if (data.amountsEnabled !== true) return empty('Xuất số liệu tổng hợp Zazzle đang tắt trong Cài đặt SocialRun.');
  if (!data.period) return empty('Chưa có ngày với dữ liệu earnings đầy đủ. Chạy Daily Report để đồng bộ CSV.');
  const period = zazzlePeriod(data.period, filters);
  const today = renderZazzleToday(data.period.today);
  if (!period) return today + empty(filters.start || filters.end ? 'Khoảng đã chọn chưa có dữ liệu.' : 'Chưa có ngày đã chốt.');
  const dates = period.start === period.end ? reportDate(period.end) : `${reportDate(period.start)} – ${reportDate(period.end)}`;
  const sales = period.days.map(row => `<tr><th scope="row">${escape(reportDate(row.day))}</th>` +
    (period.ranged ? `<td>${n(row.count)}</td>` : '') +
    `<td>${publicAmounts(row.pending, row.covered !== false, row.unknown_amounts)}</td>` +
    (period.ranged ? `<td>${publicAmounts(row.cleared, row.covered !== false, row.unknown_amounts)}</td>` : '') +
    (data.period.coverage ? `<td>${row.covered ? 'Đã chốt' : 'Chưa đủ dữ liệu'}</td>` : '') + '</tr>').join('');
  const paid = period.payments.map(row => `<tr><th scope="row">${escape(row.month.slice(5) + '/' + row.month.slice(0, 4))}</th>` +
    `<td>${row.count || row.complete !== false ? n(row.count) : '—'}</td><td>${row.amounts ? publicAmounts(row.amounts, row.complete) : escape(reportCurrency(row.cents, 'USD'))}</td>` +
    (data.period.coverage ? `<td>${row.complete ? 'Đã kiểm tra đủ' : 'Chờ kiểm tra đủ'}</td>` : '') + '</tr>').join('');
  return today + `<section class="section"><div class="section-heading"><h2>${period.ranged ? 'Earnings theo khoảng ngày' : 'Earnings ngày chốt gần nhất'}</h2>` +
    `<span class="section-note">${escape(dates)} · ${period.complete || period.sales ? n(period.sales) + ' dòng royalty' : 'Chưa đủ dữ liệu'}</span></div>` +
    (period.adjusted ? '<p class="section-note">Khoảng hiển thị đã được giới hạn theo ngày có thể báo cáo.</p>' : '') +
    (!period.complete ? '<p class="section-note">Số liệu của khoảng này còn tạm tính.</p>' : '') +
    (period.unknown ? `<p class="section-note">${n(period.unknown)} giao dịch thiếu số tiền.</p>` : '') +
    '<div class="summary zazzle-figures">' + [['total','Tổng earnings · CSV'],['pending','Pending · CSV'],['cleared','Cleared · CSV']].map(([key,label]) =>
      metric(label, publicAmounts(period[key], period.complete, period.unknown), '')).join('') +
      metric('Balance · Earnings Summary', period.balance?.covered ? publicAmounts(period.balance.amounts, true, 0) : '—',
        period.balance?.newest_checked_at ? `${n(period.balance.covered)}/${n(period.balance.accounts)} tài khoản · ${escape(sourceWindow(period.balance.oldest_checked_at, period.balance.newest_checked_at))}` : 'Chưa có Summary trong phạm vi báo cáo') +
      '</div>' + publicComparison(period) + '</section>' +
    `<section class="section"><div class="section-heading"><h2>${period.ranged ? 'Earnings từng ngày' : 'Pending 3 ngày liền trước'}</h2></div>` +
    (sales ? `<div class="report-table"><table><thead><tr><th>Ngày</th>${period.ranged ? '<th>Giao dịch</th>' : ''}<th>Pending</th>` +
      `${period.ranged ? '<th>Cleared</th>' : ''}${data.period.coverage ? '<th>Độ đầy đủ</th>' : ''}</tr></thead><tbody>${sales}</tbody></table></div>` :
      empty(period.complete ? 'Khoảng này không có dòng royalty.' : 'Chưa ghi nhận royalty từ dữ liệu đã lấy.')) +
    `</section><section class="section"><div class="section-heading"><h2>${period.ranged ? 'Payout trong khoảng ngày' : 'Payout 3 tháng gần nhất'}</h2>` +
    (data.period.coverage ? '<span class="section-note">Payment History · Đã trả</span>' : '') + '</div>' +
    (period.last_payment_day?.amounts ? `<p class="section-note">Payout gần nhất ngày ${escape(reportDate(period.last_payment_day.day))} · ${publicAmounts(period.last_payment_day.amounts, true)}</p>` : '') +
    '<div class="report-table"><table><thead><tr><th>Tháng</th><th>Khoản đã trả</th><th>Số tiền</th>' +
    (data.period.coverage ? '<th>Độ đầy đủ</th>' : '') + '</tr></thead><tbody>' +
    paid + '</tbody></table></div></section>';
}

function renderPublicSales(data, filters) {
  if (!data) return empty('Đang chờ dữ liệu Zazzle từ SocialRun.');
  if (data.amountsEnabled !== true) return empty('Xuất số liệu tổng hợp Zazzle đang tắt trong Cài đặt SocialRun.');
  if (!data.period) return empty('Chưa có CSV Earning History.');
  const result = zazzleSales(data.period, filters);
  if (!result) return empty('Bản dữ liệu này chưa có chi tiết sản phẩm.');
  const {rows, from, to, complete} = result;
  const pageSize = 100, pages = Math.max(1, Math.ceil(rows.length / pageSize));
  salesPage = Math.min(pages, Math.max(1, salesPage));
  $('zazzle-sales-pager').hidden = pages <= 1;
  $('zazzle-page').textContent = `${salesPage}/${pages}`;
  $('zazzle-prev').disabled = salesPage === 1;
  $('zazzle-next').disabled = salesPage === pages;
  const dates = reportDate(from) + (from === to ? '' : ' – ' + reportDate(to));
  const total = rows.reduce((sum, row) => sum + row[3], 0);
  const table = rows.slice((salesPage - 1) * pageSize, salesPage * pageSize).map(([day, pid, status, count, amounts, unknown]) =>
    `<tr><td>${escape(reportDate(day))}</td><th scope="row">${escape(pid || '—')}</th><td>${escape(SALE_STATES[status])}</td>` +
    `<td>${n(count)}</td><td>${publicAmounts(amounts, true, unknown)}${unknown ? `<small> · ${n(unknown)} dòng thiếu số tiền</small>` : ''}</td></tr>`).join('');
  return `<section class="section"><div class="section-heading"><h2>Check Sale</h2>` +
    `<span class="section-note">${escape(dates)} · ${n(total)} giao dịch</span></div>` +
    (!complete ? '<p class="section-note">CSV của khoảng này còn thiếu.</p>' : '') +
    (table ? `<div class="report-table" tabindex="0" aria-label="Bảng Check Sale"><table><thead><tr><th>Ngày sale</th><th>Product ID</th>` +
      `<th>Trạng thái</th><th>Số giao dịch</th><th>Royalty</th></tr></thead><tbody>${table}</tbody></table></div>` :
      empty('Chưa ghi nhận giao dịch khớp bộ lọc.')) + '</section>';
}

function renderZazzle() {
  const data = report?.zazzle;
  renderZazzleSchedule(data);
  const sales = zazzleView === 'sales';
  $('zazzle-sales-filters').hidden = !sales;
  $('zazzle-overview-tab').setAttribute('aria-pressed', String(!sales));
  $('zazzle-sales-tab').setAttribute('aria-pressed', String(sales));
  $('zazzle-sales-pager').hidden = true;
  const filters = {start: $('zazzle-start').value, end: $('zazzle-end').value, product: $('zazzle-product').value, status: $('zazzle-sale-status').value};
  const {start, end} = filters;
  const invalidRange = start && end && start > end;
  $('zazzle-clear').hidden = !(start || end || (sales && (filters.product || filters.status)));
  const coverage = $('zazzle-coverage');
  const closed = data?.period?.coverage ? data.period.latest_closed : data?.period?.end;
  coverage.hidden = !closed;
  if (closed) coverage.textContent = 'Ngày chốt gần nhất ' + reportDate(closed) + ' · ' + (data.schedule?.timezone ?? '');
  $('zazzle-filter-error').hidden = !invalidRange;
  $('zazzle-filter-error').textContent = invalidRange ? 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.' : '';
  $('zazzle-results').innerHTML = invalidRange ? '' : sales ? renderPublicSales(data, filters) : renderZazzlePeriod(data, filters);
}
function showTab(tab) {
  activeTab = tab;
  for (const name of reportTabs) {
    $(name + '-view').hidden = name !== tab;
    $(name + '-tab').setAttribute('aria-pressed', String(name === tab));
  }
  $('facebook-day-control').hidden = tab !== 'facebook';
  document.querySelector('.view-only').hidden = tab === 'zazzle';
  const [title, intro] = {
    facebook: ['Nhật ký công việc', 'Tiến độ từng nhân viên. Kết quả từng lượt chạy.'],
    zazzle: ['Báo cáo Zazzle', 'Earnings, Pending và Payment theo ngày.'],
    shortlinks: ['Traffic Shortlinks', 'Lượt click, nguồn truy cập và quốc gia theo từng link.'],
  }[tab];
  $('report-title').textContent = title;
  $('report-intro').textContent = intro;
  if (tab === 'shortlinks') renderShortlinks(report?.shortlinks, zone());
}
function render() {
  if(!report)return;
  const previous=$('day').value;
  setOptions($('day'),report.days.map(day=>[day.date,day.date.split('-').reverse().join('/')]));
  if(!previous&&report.days.length)$('day').value=report.days[0].date;
  const day=report.days.find(d=>d.date===$('day').value),tasks=tasksFor(day),s=summary(tasks);
  $('summary').innerHTML=metric('ĐÃ XÁC NHẬN',`${n(s.done)}<small>/ ${n(s.total)} lượt</small>`,s.invited?`${n(s.invited)} lời mời đã xác nhận`:'Tính cả bài đã gửi, đang chờ duyệt')+metric('ĐANG CHỜ DUYỆT',n(s.approval),'Bài đã gửi vào group',s.approval?'warning':'')+metric('CẦN XỬ LÝ',n(s.attention),'Lỗi, chưa rõ kết quả hoặc quá giờ',s.attention?'alert':'')+metric('ĐANG CHẠY',n(s.running),`${n(s.waiting)} lượt chưa hoàn tất`);
  renderEmployees(day);
  setOptions($('employee'),[...new Map((day?.employees??[]).map(e=>[e.employeeId,e.employee])).entries()],'Mọi nhân viên');
  setOptions($('group'),[...new Set(tasks.map(t=>t.group||(t.action==='wall_post'?'Wall':t.action==='story'?'Story':t.label)))].sort().map(g=>[g,g]),'Mọi nơi đăng');
  renderLog(tasks);renderZazzle();syncStatus();
  if (activeTab === 'shortlinks') renderShortlinks(report.shortlinks, zone());
}
async function refresh() {
  if(busy)return;busy=true;$('refresh').disabled=true;
  try {
    if(!config){const r=await fetch('./config.json',{cache:'no-store'});if(!r.ok)throw Error();config=await r.json();}
    const url=new URL(config.dataUrl,location.href);url.searchParams.set('v',String(Math.floor(Date.now()/30000)));
    const response=await fetch(url,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error();
    const data=await response.json();if(data.schema!==1||!Array.isArray(data.days)||!Number.isFinite(Date.parse(data.generatedAt)))throw Error();
    if(!report||new Date(data.generatedAt)>=new Date(report.generatedAt))report=data;
    fetchFailed=false;$('error').hidden=true;render();
  } catch {
    fetchFailed=true;$('error').textContent=report?'Chưa tải được bản mới. Trang vẫn giữ dữ liệu gần nhất và sẽ tự thử lại.':'Chưa tải được report. Hãy kiểm tra mạng rồi bấm Làm mới; trang sẽ tự thử lại.';$('error').hidden=false;
    if(report)syncStatus();else{$('sync').className='sync stale';$('sync').innerHTML='<span class="sync-dot"></span><span>Chưa kết nối được dữ liệu report</span>';$('employees').innerHTML=empty('Đang đợi bản report đầu tiên.');}
  } finally {busy=false;$('refresh').disabled=false;}
}
$('refresh').addEventListener('click',refresh);
for (const tab of reportTabs) $(tab+'-tab').addEventListener('click',()=>{
  const hash = tab === 'zazzle' && zazzleView === 'sales' ? '#zazzle-check-sale' : '#' + tab;
  history.replaceState(null,'',tab === 'facebook' ? location.pathname + location.search : hash);
  showTab(tab);
});
for (const tab of ['overview', 'sales']) $('zazzle-' + tab + '-tab').addEventListener('click', () => {
  zazzleView = tab;
  history.replaceState(null, '', tab === 'sales' ? '#zazzle-check-sale' : '#zazzle');
  renderZazzle();
});
const zazzleFilters = ['zazzle-start','zazzle-end','zazzle-product','zazzle-sale-status'];
for(const id of zazzleFilters) $(id).addEventListener(id === 'zazzle-product' ? 'input' : 'change', () => { salesPage = 1; renderZazzle(); });
$('zazzle-clear').addEventListener('click', () => {
  for (const id of zazzleFilters) $(id).value = '';
  salesPage = 1;
  renderZazzle();
});
$('zazzle-prev').addEventListener('click', () => { salesPage--; renderZazzle(); });
$('zazzle-next').addEventListener('click', () => { salesPage++; renderZazzle(); });
$('day').addEventListener('change',()=>{ $('employee').value='';$('group').value='';render(); });
$('timezone').addEventListener('change',()=>{try{localStorage.setItem('socialrun-report-timezone',zone());}catch{}render();});
for(const id of ['employee','group','action'])$(id).addEventListener('change',()=>renderLog(tasksFor(report?.days.find(d=>d.date===$('day').value))));
function chooseFilter(value){filter=value;document.querySelectorAll('[data-filter]').forEach(button=>{const active=button.dataset.filter===value;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});}
$('status-filters').addEventListener('click',e=>{const button=e.target.closest('[data-filter]');if(button){chooseFilter(button.dataset.filter);renderLog(tasksFor(report?.days.find(d=>d.date===$('day').value)));}});
$('clear').addEventListener('click',()=>{$('employee').value='';$('group').value='';$('action').value='';chooseFilter('all');render();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
setInterval(()=>{if(!document.hidden)refresh();},30000);
setInterval(syncStatus,15000);
function showHash() {
  const tab = location.hash;
  if (tab === '#zazzle' || tab === '#zazzle-check-sale') {
    zazzleView = tab === '#zazzle' ? 'overview' : 'sales';
    showTab('zazzle');
    renderZazzle();
  } else showTab(tab === '#shortlinks' ? 'shortlinks' : 'facebook');
}
window.addEventListener('hashchange', showHash);
showHash();
refresh();
