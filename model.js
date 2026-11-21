export const DONE = new Set(['published', 'pending_approval', 'invited', 'boundary', 'surveyed', 'commented']);
export const ATTENTION = new Set(['failed', 'partial', 'unverified', 'skipped']);
export const LABELS = {pending:'Chờ đến giờ',running:'Đang chạy',published:'Đã đăng',pending_approval:'Chờ duyệt',invited:'Đã mời',commented:'Đã xác minh bình luận',failed:'Lỗi',partial:'Chưa xong',unverified:'Chưa xác minh',stopped:'Đã dừng',cancelled:'Đã hủy',skipped:'Quá giờ',ignored:'Bỏ qua',boundary:'Đã chạy thử',surveyed:'Đã khảo sát'};
export const PLAN_LABELS = {planned:'Chưa bật',armed:'Đang chờ lịch',running:'Đang chạy',paused:'Tạm dừng',stopping:'Đang dừng',stopped:'Đã dừng',attention:'Cần kiểm tra',completed:'Đã kết thúc',completed_with_pending:'Còn việc chưa xong'};
function followExhausted(task) {
  const r=task.receipt;
  return task.action==='invite_follow' && ['invited','partial'].includes(task.state) && r?.kind==='invitation'
    && r.confirmed===true && r.queueExhausted===true && r.invited===r.verified
    && r.shortfall>0 && r.shortfall===r.requested-r.verified;
}
export function taskLabel(task) {
  if (followExhausted(task)) {
    const {receipt}=task;
    return receipt.sourceScope==='selection' ? 'Đã kiểm hết link đã chọn' : 'Hết người mời';
  }
  if (task.state === 'unverified' && task.recovery?.state === 'reconcile') {
    return task.planState === 'paused' ? 'Tạm dừng kiểm tra' : 'Chờ kiểm tra bài đã gửi';
  }
  if (task.state === 'partial' && task.followCheck?.verified > 0) return 'Đã mời một phần';
  return LABELS[task.state] || task.state;
}
function needsAttention(task) { return ATTENTION.has(task.state) && task.recovery?.state !== 'reconcile'; }
export function confirmed(task) { return DONE.has(task.state) && (['boundary','surveyed'].includes(task.state) || task.receipt?.confirmed === true); }
export function tasksFor(day) {
  return (day?.employees ?? []).flatMap(employee => employee.tasks.map(task => ({...task,
    ...(followExhausted(task) ? {state:'invited',errorCode:''} : {}),
    employee:employee.employee, employeeId:employee.employeeId, planState:employee.state})))
    .sort((a,b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.employee.localeCompare(b.employee));
}
export function summary(tasks) {
  return {total:tasks.length, done:tasks.filter(confirmed).length, approval:tasks.filter(t => confirmed(t) && t.state === 'pending_approval').length,
    attention:tasks.filter(needsAttention).length, running:tasks.filter(t => t.state === 'running').length,
    waiting:tasks.filter(t => !confirmed(t) && !needsAttention(t) && !['ignored','cancelled','stopped'].includes(t.state)).length,
    invited:tasks.reduce((n,t) => n + (t.receipt?.confirmed === true && (t.state === 'invited' || t.receipt.kind === 'invitation') ? t.receipt.invited || 0 : 0), 0)};
}
export function filtered(tasks, filters) {
  return tasks.filter(t => (!filters.employee || t.employeeId === filters.employee) && (!filters.group || (t.group || (t.action === 'wall_post' ? 'Wall' : t.action === 'story' ? 'Story' : t.label)) === filters.group)
    && matchesAction(t.action, filters.action)
    && (filters.status === 'all' || filters.status === 'done' && confirmed(t) || filters.status === 'attention' && needsAttention(t)
      || filters.status === 'waiting' && !confirmed(t) && !needsAttention(t)));
}

function matchesAction(action, filter) {
  if (!filter) return true;
  if (filter === 'invite_group') return action === 'invite_group_chrome' || action === 'invite_group_ld';
  if (filter === 'wall_story') return action === 'wall_post' || action === 'story';
  return action === filter;
}
export function tone(state) { return ['published','invited','boundary','surveyed','commented'].includes(state) ? 'good' : ['failed','partial','unverified'].includes(state) ? 'bad' : ['pending_approval','skipped'].includes(state) ? 'warm' : state === 'running' ? 'running' : ''; }

export const ZAZZLE_STATES = {
  queued:'Chờ chạy', running:'Đang chạy', needs_attention:'Cần xử lý', done:'Hoàn tất',
  partial:'Hoàn tất một phần', failed:'Lỗi', stopped:'Đã dừng',
};
export const SALE_STATES = {pending:'Pending', cleared:'Cleared', canceled:'Cancelled'};

export function zazzleSales(period, { start = '', end = '', product = '', status = '' } = {}) {
  if (!Array.isArray(period?.salesByProduct)) return null;
  const ranged = Boolean(start || end);
  const from = start || (ranged ? period.start : period.latest_closed || period.end);
  const to = end || (ranged ? period.end : from);
  const pid = product.trim();
  const rows = period.salesByProduct.filter(([day, id, state]) => day >= from && day <= to &&
    (!pid || id.includes(pid)) && (!status || state === status));
  return {from, to, rows, complete: allClosed(period.coverage ?? [], from, to)};
}
const isoDay = date => date.toISOString().slice(0, 10);
function offsetDay(day, delta) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + delta);
  return isoDay(date);
}

function amountTotal(rows, field) {
  const totals = new Map();
  for (const row of rows) {
    for (const {currency, cents} of row[field] ?? []) {
      totals.set(currency, (totals.get(currency) ?? 0) + cents);
    }
  }
  return Array.from(totals, ([currency, cents]) => ({currency, cents})).sort((a, b) => a.currency.localeCompare(b.currency));
}

function allClosed(segments, start, end) {
  const rows = segments.filter(row => row.start <= end && row.end >= start);
  return rows.length > 0 && rows[0].start <= start && rows.at(-1).end >= end
    && rows.every(row => row.accounts > 0 && row.closed === row.accounts);
}

export function zazzlePeriod(period, { start = '', end = '' } = {}) {
  if (!period?.start || !period.end) return null;
  const ranged = Boolean(start || end);
  const coverage = period.coverage;
  const latest = coverage ? period.latest_closed : period.end;
  if (!ranged && !latest) return null;
  const requestedStart = start || (ranged ? period.start : latest);
  const requestedEnd = end || (ranged ? period.end : latest);
  const from = requestedStart < period.start ? period.start : requestedStart;
  const to = requestedEnd > period.end ? period.end : requestedEnd;
  if (from > to) return null;
  const sales = (period.days ?? []).filter(row => from <= row.day && row.day <= to);
  const pendingDays = (ranged ? sales : [3, 2, 1].map(delta => {
    const day = offsetDay(to, -delta);
    return (period.days ?? []).find(row => row.day === day) ?? {day, pending: [], covered: day >= period.start};
  })).map(row => {
    if (!coverage) return row;
    const status = coverage.find(segment => segment.start <= row.day && segment.end >= row.day);
    return {...row, covered: allClosed(coverage, row.day, row.day), coverage: status};
  });

  const monthStart = new Date(to.slice(0, 7) + '-01T00:00:00Z');
  if (!ranged) monthStart.setUTCMonth(monthStart.getUTCMonth() - 2);
  const threshold = isoDay(monthStart);
  const firstPayment = ranged ? from : (coverage || threshold > period.start ? threshold : period.start);
  const payments = new Map();
  const month = new Date(firstPayment.slice(0, 7) + '-01T00:00:00Z');
  while (isoDay(month) <= to) {
    const key = isoDay(month).slice(0, 7);
    if (coverage) {
      const startDay = isoDay(month) < firstPayment ? firstPayment : isoDay(month);
      const next = new Date(month);
      next.setUTCMonth(next.getUTCMonth() + 1);
      const monthEnd = offsetDay(isoDay(next), -1);
      payments.set(key, {month: key, count: 0, amounts: [], complete: allClosed(period.payment_coverage ?? [], startDay, monthEnd < to ? monthEnd : to)});
    } else {
      payments.set(key, {month: key, count: 0, cents: 0});
    }
    month.setUTCMonth(month.getUTCMonth() + 1);
  }
  for (const row of period.payments ?? []) {
    if (row.day < firstPayment || row.day > to) continue;
    const entry = payments.get(row.day.slice(0, 7));
    entry.count += row.count;
    if (coverage) entry.amounts = amountTotal([entry, row], 'amounts');
    else entry.cents += row.cents;
  }
  const balances = (period.balanceHistory ?? []).filter(row => row.day && row.day <= to);
  const balance = !ranged && coverage ? period.balance : (balances.sort((a, b) => b.day.localeCompare(a.day))[0]
    ?? (period.balance?.day && period.balance.day <= to ? period.balance : null));
  const last = (period.payments ?? []).filter(row => firstPayment <= row.day && row.day <= to)
    .sort((a,b) => b.day.localeCompare(a.day))[0];
  return { start: from, end: to, ranged, adjusted: from !== requestedStart || to !== requestedEnd, balance,
    complete: coverage ? allClosed(coverage, from, to) : true, last_payment_day: last,
    previous: !ranged ? period.previous : null,
    sales: sales.reduce((count, row) => count + row.count, 0),
    unknown: sales.reduce((count, row) => count + row.unknown_amounts, 0),
    total: amountTotal(sales, 'total'), pending: amountTotal(sales, 'pending'), cleared: amountTotal(sales, 'cleared'),
    days: pendingDays, payments: [...payments.values()].reverse() };
}
