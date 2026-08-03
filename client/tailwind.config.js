/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', '"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'monospace'],
      },
      colors: {
        canvas: {
          DEFAULT: '#121316',
          light: '#F8F9FA',
        },
        surface: {
          DEFAULT: '#1A1C20',
          hover: '#22252A',
          raised: '#1F2128',
          light: '#FFFFFF',
          'light-hover': '#F3F4F6',
        },
        border: {
          DEFAULT: '#2A2D34',
          subtle: '#23262D',
          light: '#E5E7EB',
          focus: '#3B82F6',
        },
        text: {
          primary: '#F3F4F6',
          secondary: '#9CA3AF',
          tertiary: '#6B7280',
          'light-primary': '#111827',
          'light-secondary': '#6B7280',
        },
        accent: {
          blue: '#3B82F6',
          'blue-dim': 'rgba(59, 130, 246, 0.12)',
          green: '#10B981',
          'green-dim': 'rgba(16, 185, 129, 0.12)',
          amber: '#F59E0B',
          'amber-dim': 'rgba(245, 158, 11, 0.12)',
          red: '#EF4444',
          'red-dim': 'rgba(239, 68, 68, 0.12)',
        },
      },
      borderRadius: {
        'card': '8px',
        'pill': '9999px',
      },
      animation: {
        'fade-in': 'fadeIn 150ms ease-out',
        'slide-in': 'slideIn 150ms ease-out',
        'wave-1': 'wave1 500ms ease-in-out infinite',
        'wave-2': 'wave2 450ms ease-in-out infinite 80ms',
        'wave-3': 'wave3 550ms ease-in-out infinite 40ms',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        wave1: {
          '0%, 100%': { height: '4px' },
          '50%': { height: '14px' },
        },
        wave2: {
          '0%, 100%': { height: '6px' },
          '50%': { height: '18px' },
        },
        wave3: {
          '0%, 100%': { height: '3px' },
          '50%': { height: '11px' },
        },
      },
    },
  },
  plugins: [],
}
