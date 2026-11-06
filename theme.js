// Set the initial palette before styles paint, including on a slow mobile link.
(() => {
  const key = 'socialrun-report-theme';
  const system = matchMedia('(prefers-color-scheme: dark)');
  let preference = null;
  try {
    const saved = localStorage.getItem(key);
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch {}

  function apply(mode) {
    document.documentElement.dataset.theme = mode;
    document.querySelector('meta[name="theme-color"]').content = mode === 'dark' ? '#111916' : '#f5f6f3';
    const button = document.getElementById('theme-toggle');
    if (button) {
      const label = mode === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(mode === 'dark'));
      button.title = label;
    }
  }

  apply(preference || (system.matches ? 'dark' : 'light'));
  system.addEventListener('change', event => {
    if (!preference) apply(event.matches ? 'dark' : 'light');
  });
  document.addEventListener('DOMContentLoaded', () => {
    apply(document.documentElement.dataset.theme);
    document.getElementById('theme-toggle').addEventListener('click', () => {
      preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(key, preference); } catch {}
      apply(preference);
    });
  }, { once: true });
})();
