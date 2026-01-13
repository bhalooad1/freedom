/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        freedom: {
          red: '#BF0A30',
          blue: '#002868',
          surface: '#111111',
          border: '#222222',
          muted: '#888888',
        },
      },
    },
  },
  plugins: [],
};
