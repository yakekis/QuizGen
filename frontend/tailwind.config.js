/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Фирменная зелёная палитра Сбера — посветлее и посвежее (Sber green).
        brand: {
          50: '#e9fbf0',
          100: '#c9f5d9',
          200: '#97ebb6',
          300: '#5fdc8f',
          400: '#2fcb6a',
          500: '#1cb854',
          600: '#149a45',
          700: '#117a37',
          800: '#0f5f2c',
          900: '#0c4a24',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      backgroundImage: {
        // Фирменный градиент Сбера: зелёный → светло-зелёный → лайм.
        'sber': 'linear-gradient(135deg, #21A038 0%, #57C26A 50%, #B5E000 100%)',
        'sber-soft': 'linear-gradient(135deg, #1cb854 0%, #5fdc8f 100%)',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        hover: '0 10px 30px -10px rgba(33,160,56,0.30)',
      },
      animation: {
        'fade-in': 'fadeIn .2s ease-out',
        'slide-up': 'slideUp .25s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
