/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        tiny: {
          bg: "#F4F6F8",
          card: "#FFFFFF",
          border: "#E2E8F0",
          hover: "#F8FAFC",
          text: "#1E293B",
          muted: "#64748B",
          dark: "#0F172A",
          primary: "#0284C7",
          success: "#10B981",
          warning: "#F59E0B",
          danger: "#EF4444",
        },
      },
      keyframes: {
        flashUpdate: {
          '0%': { backgroundColor: 'rgba(254, 240, 138, 0.7)', transform: 'scale(1.002)' },
          '50%': { backgroundColor: 'rgba(254, 240, 138, 0.3)' },
          '100%': { backgroundColor: 'transparent', transform: 'scale(1)' },
        },
      },
      animation: {
        'realtime-flash': 'flashUpdate 2.5s ease-out',
      },
    },
  },
  plugins: [],
};
