/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        dark: {
          50: '#e2e8f0',
          100: '#cbd5e1',
          200: '#94a3b8',
          300: '#64748b',
          400: '#2b3f4e',
          500: '#243544',
          600: '#1d2b3a',
          700: '#16232e',
          800: '#0f1a22',
          900: '#0a1118',
        },
        accent: {
          DEFAULT: '#22c55e',
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        gold: {
          DEFAULT: '#eab308',
          light: '#facc15',
          dark: '#ca8a04',
        },
        purple: {
          DEFAULT: '#8b5cf6',
          light: '#a78bfa',
          dark: '#7c3aed',
        },
        slate: {
          DEFAULT: '#64748b',
          light: '#94a3b8',
          dark: '#475569',
        },
        rose: {
          DEFAULT: '#f43f5e',
          light: '#fb7185',
          dark: '#e11d48',
        },
        emerald: {
          DEFAULT: '#10b981',
          light: '#34d399',
          dark: '#059669',
        },
      },
      boxShadow: {
        'glow': '0 0 25px rgba(34, 197, 94, 0.3)',
        'glow-sm': '0 0 12px rgba(34, 197, 94, 0.2)',
        'glow-lg': '0 0 40px rgba(34, 197, 94, 0.35)',
        'glow-gold': '0 0 25px rgba(234, 179, 8, 0.3)',
        'glow-purple': '0 0 25px rgba(139, 92, 246, 0.3)',
        'glow-rose': '0 0 25px rgba(244, 63, 94, 0.3)',
        'card': '0 4px 16px rgba(0, 0, 0, 0.4)',
        'card-hover': '0 8px 32px rgba(0, 0, 0, 0.5)',
        'inner-glow': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.05)',
        'soft': '0 2px 8px rgba(0, 0, 0, 0.3)',
      },
      screens: {
        'xs': '475px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },
      spacing: {
        'safe': 'env(safe-area-inset-bottom, 0px)',
        '18': '4.5rem',
        '22': '5.5rem',
      },
      minHeight: {
        'screen-safe': 'calc(100vh - env(safe-area-inset-bottom, 0px))',
      },
      zIndex: {
        '60': '60',
        '70': '70',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-down': 'slide-down 0.3s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'bounce-subtle': 'bounce-subtle 2s ease-in-out infinite',
        'gradient': 'gradient 8s ease infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.5', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'bounce-subtle': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'grid-pattern': 'linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
