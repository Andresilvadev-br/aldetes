/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: { rail: v('bg-rail'), side: v('bg-side'), main: v('bg-main'), float: v('bg-float'), input: v('bg-input') },
        fg: { DEFAULT: v('fg'), muted: v('fg-muted'), faint: v('fg-faint'), strong: v('fg-strong') },
        brand: { DEFAULT: v('brand'), hover: v('brand-hover') },
        ok: v('ok'),
        warn: v('warn'),
        danger: v('danger'),
        line: v('line'),
        mention: v('mention'),
      },
      fontFamily: { sans: ['"Inter"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      keyframes: {
        pop: { '0%': { transform: 'scale(.95)', opacity: 0 }, '100%': { transform: 'scale(1)', opacity: 1 } },
        fade: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp: { '0%': { transform: 'translateY(8px)', opacity: 0 }, '100%': { transform: 'translateY(0)', opacity: 1 } },
      },
      animation: { pop: 'pop .15s ease-out', fade: 'fade .15s ease-out', slideUp: 'slideUp .2s ease-out' },
    },
  },
  plugins: [],
};
