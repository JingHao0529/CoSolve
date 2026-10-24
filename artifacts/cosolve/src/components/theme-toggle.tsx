import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { flushSync } from 'react-dom';
import type { MouseEvent } from 'react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';
  const action = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  const switchTheme = (event: MouseEvent<HTMLButtonElement>) => {
    const next = isDark ? 'light' : 'dark';
    const applyTheme = () => {
      setTheme(next);
      document.documentElement.classList.toggle('dark', next === 'dark');
    };

    if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      applyTheme();
      return;
    }

    const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    const transition = document.startViewTransition(() => flushSync(applyTheme));
    void transition.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 560, easing: 'cubic-bezier(.22,.7,.18,1)', pseudoElement: '::view-transition-new(root)' },
      );
    }).catch(() => {
      // A rapid second toggle can skip the reveal; the theme still changes.
    });
  };

  return (
    <button
      type="button"
      className="theme-toggle shrink-0"
      aria-label="Dark mode"
      aria-pressed={isDark}
      title={action}
      onClick={switchTheme}
    >
      {isDark ? <Sun key="sun" className="theme-glyph" size={17} aria-hidden="true" /> : <Moon key="moon" className="theme-glyph" size={17} aria-hidden="true" />}
      <span className="sr-only">{action}</span>
    </button>
  );
}
