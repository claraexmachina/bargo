import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Bargo pixel palette — referenced from the design brief
        bargo: {
          bg: '#B9CFF1',
          ink: '#353B51',
          accent: '#FFD700',
          soft: '#FFC3C3',
          white: '#FFFFFF',
          mint: '#9DBBE6',
        },
        // Semantic aliases so existing Tailwind utilities keep working
        primary: {
          DEFAULT: '#FFD700',
          50: '#FFFBEB',
          100: '#FFF4C2',
          200: '#FFEC94',
          300: '#FFE366',
          400: '#FFD933',
          500: '#FFD700',
          600: '#CCAC00',
          700: '#998100',
          800: '#665600',
          900: '#332B00',
          950: '#1A1500',
        },
        background: '#B9CFF1',
        foreground: '#353B51',
        card: {
          DEFAULT: '#FFFFFF',
          foreground: '#353B51',
        },
        muted: {
          DEFAULT: '#E8EEF8',
          foreground: '#5B6380',
        },
        border: '#353B51',
        input: '#353B51',
        ring: '#FFD700',
        destructive: {
          DEFAULT: '#E11D48',
          foreground: '#FFFFFF',
        },
      },
      fontFamily: {
        sans: ['"Helvetica Neue"', 'Arial', 'system-ui', 'sans-serif'],
        mono: ['"Courier New"', 'Courier', 'monospace'],
        pixel: ['"Press Start 2P"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: '0px',
        md: '0px',
        sm: '0px',
      },
      boxShadow: {
        pixel: '4px 4px 0px #353B51',
        'pixel-sm': '2px 2px 0px #353B51',
        'pixel-lg': '6px 6px 0px #353B51',
        'pixel-soft': '4px 4px 0px rgba(53, 59, 81, 0.15)',
      },
      animation: {
        'bounce-left': 'bounceLeft 1.2s ease-in-out infinite',
        'bounce-right': 'bounceRight 1.2s ease-in-out infinite',
        'bot-pulse': 'botPulse 2s ease-in-out infinite',
        'accent-blink-a': 'accentBlink 1.2s ease-in-out infinite',
        'accent-blink-b': 'accentBlink 1.2s ease-in-out infinite 0.6s',
        'pixel-float': 'pixelFloat 3s ease-in-out infinite',
      },
      keyframes: {
        bounceLeft: {
          '0%, 100%': { transform: 'translateX(0) scale(1)' },
          '50%': { transform: 'translateX(-18px) scale(1.02)' },
        },
        bounceRight: {
          '0%, 100%': { transform: 'translateX(0) scale(1)' },
          '50%': { transform: 'translateX(18px) scale(1.02)' },
        },
        botPulse: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
        accentBlink: {
          '0%, 49%, 100%': { opacity: '0' },
          '50%, 99%': { opacity: '1' },
        },
        pixelFloat: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
