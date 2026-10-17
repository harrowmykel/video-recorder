/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'studio-bg': '#090A0F',
        'studio-surface': '#12141A',
        'studio-card': '#181B22',
        'studio-dark': '#0A0C14',
        'studio-crimson': '#FF3B30',
        'studio-indigo': '#6366F1',
        'studio-emerald': '#10B981',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
