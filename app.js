import {LABELS,PLAN_LABELS,tasksFor,summary,filtered,tone,ZAZZLE_ACTIONS,ZAZZLE_STATES,zazzleProgress,zazzleRuns} from './model.js';
const $=id=>document.getElementById(id), escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let report=null,config=null,busy=false,filter='all',fetchFailed=false;
try { const saved=localStorage.getItem('socialrun-report-timezone');$('timezone').value=['Asia/Ho_Chi_Minh','America/Halifax'].includes(saved)?saved:'Asia/Ho_Chi_Minh'; } catch {}
const zone=()=>$('timezone').value, fmt=(at,options={})=>at?new Intl.DateTimeFormat('vi-VN',{timeZone:zone(),...options}).format(new Date(at)):'—';
const clock=at=>fmt(at,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}), date=at=>fmt(at,{day:'2-digit',month:'2-digit'}), full=at=>fmt(at,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const n=value=>Number(value||0).toLocaleString('vi-VN'), badge=state=>`<span class="badge ${tone(state)}">${escape(LABELS[state]||state)}</span>`;
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
  const filters={employee:$('employee').value,group:$('group').value,status:filter},rows=filtered(tasks,filters),opened=new Set([...$('log').querySelectorAll('details[open]')].map(el=>el.dataset.id));
  $('clear').hidden=!filters.employee&&!filters.group&&filter==='all';
  $('log-count').textContent=rows.length===tasks.length?n(rows.length):`${n(rows.length)}/${n(tasks.length)}`;
  $('log').innerHTML=rows.length?rows.map(t=>{
    const r=t.receipt||{},target=t.group||(t.action==='wall_post'?'Wall':t.action==='story'?'Story':''),invite=r.confirmed&&r.kind==='invitation';
    let note=t.state==='unverified'?'Chưa đủ bằng chứng xác nhận; chương trình giữ lượt này để đối soát.':t.state==='skipped'?'Đã qua khung giờ, chưa thực hiện thành công.':t.state==='failed'?'Lượt chạy có lỗi. Chi tiết chẩn đoán được giữ trên máy chạy.':t.state==='pending_approval'?'Đã gửi bài thành công, đang chờ quản trị viên group duyệt.':t.state==='published'?'Worker đã xác nhận bài được đăng.':t.state==='ignored'?'Lượt này được bỏ qua theo lựa chọn trong lịch.':'';
    if(invite){
      const accepted=r.acceptedSampleCount??(r.acceptedBySample?r.invited-r.verified:0);
      const reconciliation=t.state==='unverified'?' Phần chưa rõ đang chờ đối soát.':'';
      note=`Đã mời ${n(r.invited)} người · ${n(r.verified)} xác minh trực tiếp${accepted?` · ${n(accepted)} theo lô`:''}.${r.queueExhausted?' Đã hết người đủ điều kiện trong kho.':''}${reconciliation}`;
    }
    const safeUrl=r.url&&/^https:\/\/www\.facebook\.com\//.test(r.url)?r.url:'';
    return `<details class="log-row" data-id="${escape(t.id)}" data-tone="${tone(t.state)==='running'?'':tone(t.state)}"${opened.has(t.id)?' open':''}><summary><time class="log-time" datetime="${escape(t.scheduledAt)}">${escape(clock(t.scheduledAt))}<small class="log-day">${escape(date(t.scheduledAt))}</small></time><div class="log-main"><div class="log-title">${escape(t.employee)} <span class="log-role">/ ${escape(t.role)}</span></div><div class="log-description">${escape(t.label)}${target?' · '+escape(target):''}${invite?' · '+n(r.invited)+' người':''}</div></div><div class="log-outcome">${badge(t.state)}<span class="expand-arrow" aria-hidden="true">⌄</span></div></summary><div class="log-detail"><div class="detail-item">Thiết bị<strong>${t.engine==='chrome'?'Chrome':t.engine==='ldplayer'?'LDPlayer':'—'}</strong></div><div class="detail-item">Khung giờ<strong>${escape(clock(t.scheduledAt))} – ${escape(clock(t.endsAt))}</strong></div><div class="detail-item">Số lượng<strong>${n(t.quantity)} ${t.action.startsWith('invite_')?'người':'lượt'}</strong></div><div class="detail-item">Số lần chạy<strong>${n(t.attempts)}</strong></div>${t.attempts?`<div class="detail-item">Ghi nhận gần nhất<strong>${escape(full(t.updatedAt))}</strong></div>`:''}${note?`<p class="detail-note">${escape(note)}</p>`:''}${t.errorCode?`<p class="detail-note">Mã lỗi: ${escape(t.errorCode)}</p>`:''}${safeUrl?`<a class="post-link" href="${escape(safeUrl)}" target="_blank" rel="noopener noreferrer">Xem bài trên Facebook ↗</a>`:''}</div></details>`;
  }).join(''):empty(tasks.length?'Không có lượt nào khớp bộ lọc.':'Ngày này chưa có công việc.');
}
const reportDate = day => day.split('-').reverse().join('/');
const reportCurrency = (cents, currency) => new Intl.NumberFormat('vi-VN', {style:'currency', currency}).format(cents / 100);
function publicAmounts(amounts, covered, unknown = 0) {
  return escape(amounts.length ? amounts.map(row => reportCurrency(row.cents, row.currency)).join(' · ') :
    covered && !unknown ? reportCurrency(0, 'USD') : '—');
}
function renderZazzleAmounts(run) {
  const daily = run.daily;
  if (report.zazzle?.amountsEnabled !== true || !daily) return '';
  const today = daily.today;
  const coverage = (covered, missing = 0) =>
    n(covered) + '/' + n(daily.account_count) + ' nick' + (missing ? ' · ' + n(missing) + ' dòng thiếu số tiền' : '');
  const pending = daily.dates.map(day => {
    const entry = daily.pending[day];
    return '<tr><th scope="row">' + escape(reportDate(day)) + '</th><td>' +
      publicAmounts(entry.amounts, entry.covered, entry.unknown_amounts) + '</td><td>' +
      coverage(entry.covered, entry.unknown_amounts) + '</td></tr>';
  }).join('');
  const paid = [...daily.months].reverse().map(month => {
    const entry = daily.payments[month];
    const label = month.slice(5,7) + '/' + month.slice(0,4);
    return '<tr><th scope="row">' + escape(label) + '</th><td>' + (entry.covered ? n(entry.count) : '—') + '</td><td>' +
      publicAmounts(entry.amounts, entry.covered) + '</td><td>' + coverage(entry.covered) + '</td></tr>';
  }).join('');
  return '<section class="section"><div class="section-heading"><h2>Earnings Today</h2><span class="section-note">' +
    coverage(today.covered, today.unknown_amounts) + '</span></div><div class="summary zazzle-figures">' +
    [['total','Tổng earnings'],['pending','Pending'],['cleared','Cleared']].map(([key,label]) =>
      metric(label, publicAmounts(today[key], today.covered, today.unknown_amounts), '')).join('') +
    '</div></section><section class="section"><div class="section-heading"><h2>Pending 3 ngày liên tiếp</h2></div><div class="report-table">' +
    '<table><thead><tr><th>Ngày</th><th>Pending</th><th>Độ phủ CSV</th></tr></thead><tbody>' + pending +
    '</tbody></table></div></section><section class="section"><div class="section-heading"><h2>Payment 3 tháng gần nhất</h2></div>' +
    '<div class="report-table"><table><thead><tr><th>Tháng</th><th>Khoản đã trả</th><th>Số tiền</th><th>Độ phủ CSV</th></tr></thead><tbody>' +
    paid + '</tbody></table></div></section>';
}
function renderZazzle() {
  const runs = zazzleRuns(report?.zazzle);
  const dates = [...new Set(runs.map(run => run.date))];
  setOptions($('zazzle-day'), dates.map(day => [day, reportDate(day)]));
  const filteredRuns = zazzleRuns(report?.zazzle, $('zazzle-day').value);
  setOptions($('zazzle-run'), filteredRuns.map(run => [run.id, (ZAZZLE_ACTIONS[run.action] || 'Lượt Zazzle') + ' · ' + clock(run.createdAt)]));
  const run = filteredRuns.find(value => value.id === $('zazzle-run').value);
  $('zazzle-day').disabled = !runs.length;
  $('zazzle-run').disabled = !filteredRuns.length;
  const details = $('zazzle-details');
  if (!run) { details.innerHTML = empty('Chưa có lượt Zazzle đồng bộ cho ngày này.'); return; }
  const s = zazzleProgress(run);
  details.innerHTML = '<div class="zazzle-run-state"><strong>' + escape(ZAZZLE_STATES[run.state] || 'Cần kiểm tra') +
    '</strong><span>Cập nhật ' + escape(full(run.updatedAt)) + '</span></div><div class="summary">' +
    metric('HOÀN TẤT', n(s.done) + '<small>/ ' + n(run.total) + ' nick</small>', 'Đã đủ bước của action') +
    metric('CẦN KIỂM TRA', n(s.attention), 'Lỗi hoặc mới hoàn tất một phần', s.attention ? 'alert' : '') +
    metric('CHƯA XONG', n(s.waiting), 'Đang chờ hoặc đang chạy') +
    metric('DỪNG / BỎ QUA', n(s.skipped), 'Theo trạng thái worker') +
    '</div>' + renderZazzleAmounts(run);
}
function showTab(tab) {
  const zazzle = tab === 'zazzle';
  $('facebook-view').hidden = $('facebook-day-control').hidden = zazzle;
  $('zazzle-view').hidden = $('zazzle-day-control').hidden = !zazzle;
  $('facebook-tab').setAttribute('aria-pressed', String(!zazzle));
  $('zazzle-tab').setAttribute('aria-pressed', String(zazzle));
  $('report-intro').textContent = zazzle ? 'Tiến độ và kết quả các lượt worker Zazzle.' : 'Tiến độ từng nhân viên. Kết quả từng lượt chạy.';
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
for(const tab of ['facebook','zazzle']) $(tab+'-tab').addEventListener('click',()=>{
  history.replaceState(null,'',tab==='zazzle'?'#zazzle':location.pathname+location.search);
  showTab(tab);
});
for(const id of ['zazzle-day','zazzle-run']) $(id).addEventListener('change',renderZazzle);
$('day').addEventListener('change',()=>{ $('employee').value='';$('group').value='';render(); });
$('timezone').addEventListener('change',()=>{try{localStorage.setItem('socialrun-report-timezone',zone());}catch{}render();});
for(const id of ['employee','group'])$(id).addEventListener('change',()=>renderLog(tasksFor(report?.days.find(d=>d.date===$('day').value))));
function chooseFilter(value){filter=value;document.querySelectorAll('[data-filter]').forEach(button=>{const active=button.dataset.filter===value;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});}
$('status-filters').addEventListener('click',e=>{const button=e.target.closest('[data-filter]');if(button){chooseFilter(button.dataset.filter);renderLog(tasksFor(report?.days.find(d=>d.date===$('day').value)));}});
$('clear').addEventListener('click',()=>{$('employee').value='';$('group').value='';chooseFilter('all');render();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
setInterval(()=>{if(!document.hidden)refresh();},30000);
setInterval(syncStatus,15000);
showTab(location.hash==='#zazzle'?'zazzle':'facebook');
refresh();
