export const DONE = new Set(['published', 'pending_approval', 'invited', 'boundary', 'surveyed', 'commented']);
export const ATTENTION = new Set(['failed', 'partial', 'unverified', 'skipped']);
export const LABELS = {pending:'Chờ đến giờ',running:'Đang chạy',published:'Đã đăng',pending_approval:'Chờ duyệt',invited:'Đã mời',commented:'Đã xác minh bình luận',failed:'Lỗi',partial:'Chưa xong',unverified:'Chưa xác minh',stopped:'Đã dừng',cancelled:'Đã hủy',skipped:'Quá giờ',ignored:'Bỏ qua',boundary:'Đã chạy thử',surveyed:'Đã khảo sát'};
export const PLAN_LABELS = {planned:'Chưa bật',armed:'Đang chờ lịch',running:'Đang chạy',paused:'Tạm dừng',stopping:'Đang dừng',stopped:'Đã dừng',attention:'Cần kiểm tra',completed:'Đã kết thúc',completed_with_pending:'Còn việc chưa xong'};
export function confirmed(task) { return DONE.has(task.state) && (['boundary','surveyed'].includes(task.state) || task.receipt?.confirmed === true); }
export function tasksFor(day) { return (day?.employees ?? []).flatMap(employee => employee.tasks.map(task => ({...task, employee:employee.employee, employeeId:employee.employeeId, planState:employee.state}))).sort((a,b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.employee.localeCompare(b.employee)); }
export function summary(tasks) {
  return {total:tasks.length, done:tasks.filter(confirmed).length, approval:tasks.filter(t => confirmed(t) && t.state === 'pending_approval').length,
    attention:tasks.filter(t => ATTENTION.has(t.state)).length, running:tasks.filter(t => t.state === 'running').length,
    waiting:tasks.filter(t => !confirmed(t) && !ATTENTION.has(t.state) && !['ignored','cancelled','stopped'].includes(t.state)).length,
    invited:tasks.reduce((n,t) => n + (t.receipt?.confirmed === true && (t.state === 'invited' || t.receipt.kind === 'invitation') ? t.receipt.invited || 0 : 0), 0)};
}
export function filtered(tasks, filters) {
  return tasks.filter(t => (!filters.employee || t.employeeId === filters.employee) && (!filters.group || (t.group || (t.action === 'wall_post' ? 'Wall' : t.action === 'story' ? 'Story' : t.label)) === filters.group)
    && (filters.status === 'all' || filters.status === 'done' && confirmed(t) || filters.status === 'attention' && ATTENTION.has(t.state)
      || filters.status === 'waiting' && !confirmed(t) && !ATTENTION.has(t.state)));
}
export function tone(state) { return ['published','invited','boundary','surveyed','commented'].includes(state) ? 'good' : ['failed','partial','unverified'].includes(state) ? 'bad' : ['pending_approval','skipped'].includes(state) ? 'warm' : state === 'running' ? 'running' : ''; }

export const ZAZZLE_STATES = {
  queued:'Chờ chạy', running:'Đang chạy', needs_attention:'Cần xử lý', done:'Hoàn tất',
  partial:'Hoàn tất một phần', failed:'Lỗi', stopped:'Đã dừng',
};
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

export function zazzlePeriod(period, { start = '', end = '' } = {}) {
  if (!period?.start || !period.end) return null;
  const ranged = Boolean(start || end);
  const requestedStart = start || (ranged ? period.start : period.end);
  const requestedEnd = end || period.end;
  const from = requestedStart < period.start ? period.start : requestedStart;
  const to = requestedEnd > period.end ? period.end : requestedEnd;
  if (from > to) return null;
  const sales = (period.days ?? []).filter(row => from <= row.day && row.day <= to);
  const pendingDays = ranged ? sales : [3, 2, 1].map(delta => {
    const day = offsetDay(to, -delta);
    return (period.days ?? []).find(row => row.day === day) ?? {day, pending: [], covered: day >= period.start};
  });

  const monthStart = new Date(to.slice(0, 7) + '-01T00:00:00Z');
  if (!ranged) monthStart.setUTCMonth(monthStart.getUTCMonth() - 2);
  const threshold = isoDay(monthStart);
  const firstPayment = ranged ? from : threshold > period.start ? threshold : period.start;
  const payments = new Map();
  const month = new Date(firstPayment.slice(0, 7) + '-01T00:00:00Z');
  while (isoDay(month) <= to) {
    const key = isoDay(month).slice(0, 7);
    payments.set(key, {month: key, count: 0, cents: 0});
    month.setUTCMonth(month.getUTCMonth() + 1);
  }
  for (const row of period.payments ?? []) {
    if (row.day < firstPayment || row.day > to) continue;
    const entry = payments.get(row.day.slice(0, 7));
    entry.count += row.count;
    entry.cents += row.cents;
  }
  return { start: from, end: to, ranged, adjusted: from !== requestedStart || to !== requestedEnd,
    sales: sales.reduce((count, row) => count + row.count, 0),
    unknown: sales.reduce((count, row) => count + row.unknown_amounts, 0),
    total: amountTotal(sales, 'total'), pending: amountTotal(sales, 'pending'), cleared: amountTotal(sales, 'cleared'),
    days: pendingDays, payments: [...payments.values()].reverse() };
}
