/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border:       'oklch(var(--border) / <alpha-value>)',
        input:        'oklch(var(--border) / <alpha-value>)',
        ring:         'oklch(var(--ring) / <alpha-value>)',
        background:   'oklch(var(--bg) / <alpha-value>)',
        foreground:   'oklch(var(--ink) / <alpha-value>)',
        surface: {
          DEFAULT: 'oklch(var(--surface) / <alpha-value>)',
          2:       'oklch(var(--surface-2) / <alpha-value>)',
        },
        muted: {
          DEFAULT:    'oklch(var(--surface-2) / <alpha-value>)',
          foreground: 'oklch(var(--ink-muted) / <alpha-value>)',
        },
        primary: {
          DEFAULT:    'oklch(var(--primary) / <alpha-value>)',
          foreground: 'oklch(var(--ink) / <alpha-value>)',
          hover:      'oklch(var(--primary-hover) / <alpha-value>)',
        },
        secondary: {
          DEFAULT:    'oklch(var(--surface-2) / <alpha-value>)',
          foreground: 'oklch(var(--ink) / <alpha-value>)',
        },
        destructive: {
          DEFAULT:    'oklch(var(--error) / <alpha-value>)',
          foreground: 'oklch(var(--ink) / <alpha-value>)',
        },
        card: {
          DEFAULT:    'oklch(var(--surface) / <alpha-value>)',
          foreground: 'oklch(var(--ink) / <alpha-value>)',
        },
        accent: {
          DEFAULT:    'oklch(var(--primary) / <alpha-value>)',
          foreground: 'oklch(var(--ink) / <alpha-value>)',
        },
        popover: {
          DEFAULT:    'oklch(var(--surface-2) / <alpha-value>)',
          foreground: 'oklch(var(--ink) / <alpha-value>)',
        },
        // Semantic status colors
        success:  'oklch(var(--accent) / <alpha-value>)',
        warning:  'oklch(var(--warning) / <alpha-value>)',
        error:    'oklch(var(--error) / <alpha-value>)',
      },
      borderRadius: {
        sm:  '0.25rem',
        DEFAULT: '0.375rem',
        md:  '0.5rem',
        lg:  '0.625rem',
        xl:  '0.875rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        full: '9999px',
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        // Product UI fixed rem scale — no fluid clamp
        'heading-xl': ['1.75rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em', fontWeight: '600' }],
        'heading-lg': ['1.375rem', { lineHeight: '1.875rem', letterSpacing: '-0.015em', fontWeight: '600' }],
        'heading-md': ['1.125rem', { lineHeight: '1.5rem',  letterSpacing: '-0.01em',  fontWeight: '600' }],
        'heading-sm': ['0.9375rem',{ lineHeight: '1.375rem', letterSpacing: '-0.005em', fontWeight: '600' }],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
        'fade-in':        'fade-in 0.2s ease-out both',
        'fade-up':        'fade-up 0.25s ease-out both',
        'scale-in':       'scale-in 0.2s ease-out both',
        shimmer:          'shimmer 1.8s linear infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
