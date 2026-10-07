import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

const OPTIONS = [
  { id: 'system', label: 'Match system', Icon: Monitor },
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'dark', label: 'Dark', Icon: Moon },
];

const readPref = () => {
  try { return localStorage.getItem('theme') || 'system'; } catch { return 'system'; }
};

export default function ThemeToggle({ className = '' }) {
  const [pref, setPref] = useState(readPref);

  useEffect(() => {
    try { localStorage.setItem('theme', pref); } catch { /* private mode: the choice lasts this visit */ }
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'system' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e131c' : '#dde3eb');
    };
    apply();
    if (pref !== 'system') return undefined;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [pref]);

  return (
    <div className={`theme-toggle ${className}`} role="group" aria-label="Theme">
      {OPTIONS.map(({ id, label, Icon }) => (
        <button key={id} type="button" aria-pressed={pref === id} aria-label={label} title={label} onClick={() => setPref(id)}>
          <Icon size={15} strokeWidth={1.75} />
        </button>
      ))}
    </div>
  );
}
