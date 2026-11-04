/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      // phones, including landscape (a phone on its side is wider than 767 px but short and touch-only)
      screens: { phone: { raw: '(max-width: 767px), (pointer: coarse) and (max-height: 500px)' } },
      colors: {
        bg: { rail: v('bg-rail'), side: v('bg-side'), main: v('bg-main'), float: v('bg-float'), input: v('bg-input') },
        fg: { DEFAULT: v('fg'), muted: v('fg-muted'), faint: v('fg-faint'), strong: v('fg-strong') },
        brand: { DEFAULT: v('brand'), hover: v('brand-hover'), 2: v('brand-2') },
        ok: v('ok'),
        warn: v('warn'),
        danger: v('danger'),
        line: v('line'),
        mention: v('mention'),
      },
      fontFamily: { sans: ['"Inter"', '"Segoe UI Variable Text"', '"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', 'sans-serif'] },
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--brand) / 0.35), 0 8px 30px -8px rgb(var(--brand) / 0.55)',
        float: '0 24px 60px -12px rgb(0 0 0 / 0.7)',
      },
      keyframes: {
        pop: { '0%': { transform: 'scale(.96)', opacity: 0 }, '100%': { transform: 'scale(1)', opacity: 1 } },
        fade: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp: { '0%': { transform: 'translateY(8px)', opacity: 0 }, '100%': { transform: 'translateY(0)', opacity: 1 } },
      },
      animation: { pop: 'pop .18s cubic-bezier(.22,1,.36,1)', fade: 'fade .15s ease-out', slideUp: 'slideUp .22s cubic-bezier(.22,1,.36,1)' },
    },
  },
  plugins: [],
};
