import { extendTheme } from '@chakra-ui/react';

// Define the custom UDL theme
const udlTheme = extendTheme({
  config: {
    initialColorMode: 'light',
    useSystemColorMode: true,
  },
  colors: {
    brand: {
      50: '#F5F3FF',
      100: '#EDE9FE',
      200: '#DDD6FE',
      300: '#C4B5FD',
      400: '#A78BFA',
      500: '#5B4FFF', // Our primary Mathematicore purple
      600: '#7C3AED',
      700: '#6D28D9',
      800: '#5B21B6',
      900: '#4C1D95',
    },
    // High contrast palette for UDL
    highContrast: {
      bg: '#000000',
      text: '#FFFFFF',
      accent: '#FFFF00', // Yellow stands out well against black
      error: '#FF3333',
      success: '#00FF00',
    }
  },
  styles: {
    global: (props) => ({
      body: {
        bg: props.colorMode === 'dark' ? 'gray.900' : 'gray.50',
        color: props.colorMode === 'dark' ? 'white' : 'gray.900',
      },
      // Ensure MathML / Katex elements are legible in dark mode
      '.katex': {
        color: props.colorMode === 'dark' ? 'white' : 'inherit',
      },
      '.mq-math-mode': {
        color: props.colorMode === 'dark' ? 'white' : 'inherit',
        borderColor: props.colorMode === 'dark' ? 'whiteAlpha.400' : 'blackAlpha.400',
      }
    }),
  },
  components: {
    Button: {
      baseStyle: {
        fontWeight: 'bold',
        borderRadius: '12px',
      },
      variants: {
        solid: (props) => ({
          bg: props.colorMode === 'dark' ? 'brand.400' : 'brand.500',
          color: 'white',
          _hover: {
            bg: props.colorMode === 'dark' ? 'brand.300' : 'brand.600',
          },
        }),
      },
    },
  },
});

export default udlTheme;
