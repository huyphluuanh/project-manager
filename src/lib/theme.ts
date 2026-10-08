export type ThemePref = 'light' | 'dark' | 'system';

const KEY = 'pm:theme';
let media: MediaQueryList | null = null;
let current: ThemePref = 'system';

function paint() {
  const dark = current === 'dark' || (current === 'system' && !!media?.matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e1015' : '#4f46e5');
}

export function initTheme() {
  media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', paint);
  try { current = (localStorage.getItem(KEY) as ThemePref) || 'system'; } catch { /* ignore */ }
  paint();
}

export function applyTheme(pref: ThemePref) {
  current = pref;
  try { localStorage.setItem(KEY, pref); } catch { /* ignore */ }
  paint();
}
