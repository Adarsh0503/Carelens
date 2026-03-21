/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
      },
      colors: {
        navy: {
          950: '#060d1f',
          900: '#0a1628',
          800: '#0f2044',
          700: '#1a3260',
        },
        mint: {
          400: '#4dd9ac',
          500: '#2ec99a',
          600: '#1aaa80',
        },
        cream: '#f8f5f0',
        rose: '#ff6b6b',
      },
      animation: {
        'fade-up': 'fadeUp 0.6s ease forwards',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'typing': 'typing 1.2s steps(3) infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        typing: {
          '0%': { content: '.' },
          '33%': { content: '..' },
          '66%': { content: '...' },
        },
      },
    },
  },
  plugins: [],
}
