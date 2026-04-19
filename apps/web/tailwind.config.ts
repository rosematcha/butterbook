import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'ui-serif', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
      colors: {
        // Warm paper-ish neutrals
        paper: {
          50: '#fbfaf7',
          100: '#f5f3ec',
          200: '#ebe7dc',
          300: '#d9d3c2',
          400: '#b8afa0',
          500: '#8b8376',
          600: '#5d564b',
          700: '#3d3832',
          800: '#262320',
          900: '#14130f',
        },
        ink: {
          DEFAULT: '#1a1714',
        },
        // A single warm accent — dried-rose / terracotta (default fallback)
        accent: {
          50: '#fbf2ee',
          100: '#f5e0d7',
          200: '#ecc2b1',
          300: '#dd9a82',
          400: '#c8735b',
          500: '#b0573d',
          600: '#8e4530',
          700: '#6e3726',
          800: '#4f2a1d',
          900: '#331b14',
        },
        // Org branding — resolves from CSS variables set at runtime.
        // Works with Tailwind opacity modifiers, e.g. `bg-brand-accent/10`.
        brand: {
          primary: 'rgb(var(--brand-primary) / <alpha-value>)',
          secondary: 'rgb(var(--brand-secondary) / <alpha-value>)',
          accent: 'rgb(var(--brand-accent) / <alpha-value>)',
          'on-primary': 'rgb(var(--brand-on-primary) / <alpha-value>)',
          'on-accent': 'rgb(var(--brand-on-accent) / <alpha-value>)',
        },
      },
      letterSpacing: {
        'tight-er': '-0.02em',
      },
    },
  },
  plugins: [],
};
export default config;
