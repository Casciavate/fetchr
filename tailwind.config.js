module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f3f0ff',
          100: '#e9e3ff',
          200: '#d5cbff',
          300: '#b8a7ff',
          400: '#9578ff',
          500: '#7c4fff',
          600: '#6c47ff',
          700: '#5a35f0',
          800: '#4a2ac9',
          900: '#3d25a3',
          950: '#1e1060',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(108,71,255,0.06), 0 4px 16px rgba(108,71,255,0.08), 0 0 0 1px rgba(108,71,255,0.04)',
        'card-hover': '0 4px 12px rgba(108,71,255,0.12), 0 16px 40px rgba(108,71,255,0.12), 0 0 0 1px rgba(108,71,255,0.08)',
        'button': '0 2px 8px rgba(108,71,255,0.35), 0 1px 2px rgba(108,71,255,0.2)',
        'float': '0 20px 60px rgba(108,71,255,0.15)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'gradient': 'gradient 8s ease infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        gradient: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
      },
    },
  },
  plugins: [],
};