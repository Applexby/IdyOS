import type { Config } from 'tailwindcss'

const config: Config = {
  // Modo oscuro por clase (.dark en <html>), controlado desde el menú de usuario
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#ffc500',
        'primary-dark': '#e6b000',
      },
      keyframes: {
        enter: {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.98)' },
          to:   { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        enter: 'enter 160ms ease-out',
      },
    },
  },
  plugins: [],
}

export default config
