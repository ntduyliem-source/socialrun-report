export const DONE = new Set(['published', 'pending_approval', 'invited', 'boundary', 'surveyed']);
export const ATTENTION = new Set(['failed', 'partial', 'unverified', 'skipped']);
export const LABELS = {pending:'Chờ đến giờ',running:'Đang chạy',published:'Đã đăng',pending_approval:'Chờ duyệt',invited:'Đã mời',failed:'Lỗi',partial:'Chưa xong',unverified:'Chưa xác minh',stopped:'Đã dừng',cancelled:'Đã hủy',skipped:'Quá giờ',ignored:'Bỏ qua',boundary:'Đã chạy thử',surveyed:'Đã khảo sát'};
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
export function tone(state) { return ['published','invited','boundary','surveyed'].includes(state) ? 'good' : ['failed','partial','unverified'].includes(state) ? 'bad' : ['pending_approval','skipped'].includes(state) ? 'warm' : state === 'running' ? 'running' : ''; }

export const ZAZZLE_ACTIONS = {
  check_store:'Check store', check_balance:'Check balance', check_information:'Check information',
  check_payment_history:'Check payment history', download_history:'Download earning history', daily_report:'Daily report',
};
export const ZAZZLE_STATES = {
  queued:'Chờ chạy', running:'Đang chạy', needs_attention:'Cần xử lý', done:'Hoàn tất',
  partial:'Hoàn tất một phần', failed:'Lỗi', stopped:'Đã dừng',
};
export function zazzleProgress(run) {
  const counts = run?.accounts ?? {};
  return {done:counts.done ?? 0, attention:(counts.failed ?? 0) + (counts.partial ?? 0),
    waiting:(counts.pending ?? 0) + (counts.running ?? 0), skipped:(counts.stopped ?? 0) + (counts.skipped ?? 0)};
}

export function zazzleRuns(data, day) {
  const runs = Array.isArray(data?.runs) ? data.runs : [];
  return day ? runs.filter(run => run.date === day) : runs;
}
