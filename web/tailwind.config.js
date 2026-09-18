/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        teal: {
          DEFAULT: '#0B6259',
          light: '#E4F2F0',
          mid: '#1D9E8C',
        },
        gold: {
          DEFAULT: '#C8922A',
          light: '#FBF3E2',
          mid: '#E8B550',
        },
      },
    },
  },
  plugins: [],
};
