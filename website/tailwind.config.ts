import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./src/styles/**/*.css",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Map semantic names to CSS variables using OKLCH
        primary: 'oklch(var(--primary) / <alpha-value>)',
        secondary: 'oklch(var(--secondary) / <alpha-value>)',
        destructive: 'oklch(var(--destructive) / <alpha-value>)',
        muted: 'oklch(var(--muted) / <alpha-value>)',
        accent: 'oklch(var(--accent) / <alpha-value>)',
        card: 'oklch(var(--card) / <alpha-value>)',
        popover: 'oklch(var(--popover) / <alpha-value>)',
        border: 'oklch(var(--border) / <alpha-value>)',
        input: 'oklch(var(--input) / <alpha-value>)',
        ring: 'oklch(var(--ring) / <alpha-value>)',
        background: 'oklch(var(--background) / <alpha-value>)',
        foreground: 'oklch(var(--foreground) / <alpha-value>)',
        'primary-foreground': 'oklch(var(--primary-foreground) / <alpha-value>)',
        'secondary-foreground': 'oklch(var(--secondary-foreground) / <alpha-value>)',
        'destructive-foreground': 'oklch(var(--destructive-foreground) / <alpha-value>)',
        'muted-foreground': 'oklch(var(--muted-foreground) / <alpha-value>)',
        'accent-foreground': 'oklch(var(--accent-foreground) / <alpha-value>)',
        'card-foreground': 'oklch(var(--card-foreground) / <alpha-value>)',
        'popover-foreground': 'oklch(var(--popover-foreground) / <alpha-value>)',
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      
      // Enhanced backdrop blur utilities
      backdropBlur: {
        'xs': '2px',
        'sm': '4px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
      
      // Extended backdrop saturate values
      backdropSaturate: {
        '110': '1.1',
        '120': '1.2',
        '130': '1.3',
        '140': '1.4',
        '150': '1.5',
      },
      fontSize: {
        // Display sizes with mathematical progression
        "display-2xl": ["clamp(4rem, 8vw, 6rem)", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        "display-xl": ["clamp(3rem, 6vw, 4.5rem)", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        "display-lg": ["clamp(2.5rem, 5vw, 3.75rem)", { lineHeight: "1.1", letterSpacing: "-0.015em" }],
        "display-md": ["clamp(2rem, 4vw, 3rem)", { lineHeight: "1.2", letterSpacing: "-0.015em" }],
        "display-sm": ["clamp(1.75rem, 3.5vw, 2.25rem)", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
        
        // Heading sizes
        "heading-xl": ["clamp(1.5rem, 3vw, 2rem)", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
        "heading-lg": ["clamp(1.25rem, 2.5vw, 1.75rem)", { lineHeight: "1.2", letterSpacing: "-0.005em" }],
        "heading-md": ["clamp(1.125rem, 2vw, 1.5rem)", { lineHeight: "1.3", letterSpacing: "-0.005em" }],
        "heading-sm": ["clamp(1rem, 1.5vw, 1.25rem)", { lineHeight: "1.3", letterSpacing: "0em" }],
        
        // Body sizes with optimized line heights
        "body-xl": ["1.25rem", { lineHeight: "1.6", letterSpacing: "0em" }],
        "body-lg": ["1.125rem", { lineHeight: "1.6", letterSpacing: "0em" }],
        "body-md": ["1rem", { lineHeight: "1.5", letterSpacing: "0em" }],
        "body-sm": ["0.875rem", { lineHeight: "1.5", letterSpacing: "0em" }],
        "body-xs": ["0.75rem", { lineHeight: "1.5", letterSpacing: "0.01em" }],
        
        // Caption sizes
        "caption-lg": ["0.875rem", { lineHeight: "1.4", letterSpacing: "0.005em" }],
        "caption-md": ["0.75rem", { lineHeight: "1.4", letterSpacing: "0.01em" }],
        "caption-sm": ["0.6875rem", { lineHeight: "1.4", letterSpacing: "0.01em" }],
      },
      fontWeight: {
        light: "300",
        regular: "400",
        medium: "500",
        semibold: "600",
        bold: "700",
        extrabold: "800",
        black: "900",
      },
      letterSpacing: {
        tight: "-0.02em",
        snug: "-0.01em",
        normal: "0em",
        wide: "0.01em",
        wider: "0.02em",
        widest: "0.05em",
      },
      lineHeight: {
        tight: "1.1",
        snug: "1.2",
        normal: "1.5",
        relaxed: "1.6",
        loose: "1.7",
      },
      typography: {
        DEFAULT: {
          css: {
            // Base typography styles
            fontSize: "1rem",
            lineHeight: "1.5",
            fontFamily: "var(--font-inter)",
            
            // Headings with optimized spacing
            "h1, h2, h3, h4, h5, h6": {
              fontWeight: "600",
              letterSpacing: "-0.01em",
              textWrap: "balance",
            },
            
            // Paragraph spacing
            p: {
              marginTop: "1.25em",
              marginBottom: "1.25em",
              textWrap: "pretty",
            },
            
            // List styling
            "ul, ol": {
              marginTop: "1.25em",
              marginBottom: "1.25em",
              paddingLeft: "1.5em",
            },
            
            // Code styling
            code: {
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: "0.875em",
              fontWeight: "500",
              backgroundColor: "hsl(var(--muted))",
              padding: "0.25em 0.375em",
              borderRadius: "0.25rem",
            },
            
            // Pre-formatted code blocks
            pre: {
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: "0.875em",
              lineHeight: "1.5",
              backgroundColor: "hsl(var(--muted))",
              padding: "1rem",
              borderRadius: "0.5rem",
              overflow: "auto",
            },
            
            // Blockquotes
            blockquote: {
              fontStyle: "italic",
              borderLeft: "4px solid hsl(var(--border))",
              paddingLeft: "1rem",
              marginLeft: "0",
              marginRight: "0",
            },
            
            // Links
            a: {
              color: "hsl(var(--primary))",
              textDecoration: "none",
              fontWeight: "500",
              "&:hover": {
                textDecoration: "underline",
              },
            },
            
            // Strong text
            strong: {
              fontWeight: "600",
            },
            
            // Tables
            table: {
              fontSize: "0.875em",
              lineHeight: "1.4",
            },
            
            // Captions
            figcaption: {
              fontSize: "0.875em",
              lineHeight: "1.4",
              color: "hsl(var(--muted-foreground))",
              textAlign: "center",
              marginTop: "0.5em",
            },
          },
        },
        
        // Dark mode overrides
        dark: {
          css: {
            color: "hsl(var(--foreground))",
            
            code: {
              backgroundColor: "hsl(var(--muted))",
              color: "hsl(var(--foreground))",
            },
            
            pre: {
              backgroundColor: "hsl(var(--muted))",
              color: "hsl(var(--foreground))",
            },
            
            blockquote: {
              borderLeftColor: "hsl(var(--border))",
              color: "hsl(var(--muted-foreground))",
            },
            
            a: {
              color: "hsl(var(--primary))",
            },
            
            figcaption: {
              color: "hsl(var(--muted-foreground))",
            },
          },
        },
      },
      
      // Enhanced spacing system
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '26': '6.5rem',
        '30': '7.5rem',
        '34': '8.5rem',
        '38': '9.5rem',
        '42': '10.5rem',
        '46': '11.5rem',
        '50': '12.5rem',
        '54': '13.5rem',
        '58': '14.5rem',
        '62': '15.5rem',
        '66': '16.5rem',
        '70': '17.5rem',
        '74': '18.5rem',
        '78': '19.5rem',
        '82': '20.5rem',
        '86': '21.5rem',
        '90': '22.5rem',
        '94': '23.5rem',
        '98': '24.5rem',
        '102': '25.5rem',
      },
      
      // Enhanced shadow system with OKLCH colors
      boxShadow: {
        'xs': '0 1px 2px color-mix(in oklch, var(--foreground) 5%, transparent)',
        'sm': '0 1px 3px color-mix(in oklch, var(--foreground) 8%, transparent)',
        'md': '0 4px 6px color-mix(in oklch, var(--foreground) 5%, transparent), 0 2px 4px color-mix(in oklch, var(--foreground) 3%, transparent)',
        'lg': '0 10px 15px color-mix(in oklch, var(--foreground) 8%, transparent), 0 4px 6px color-mix(in oklch, var(--foreground) 5%, transparent)',
        'xl': '0 20px 25px color-mix(in oklch, var(--foreground) 10%, transparent), 0 10px 10px color-mix(in oklch, var(--foreground) 3%, transparent)',
        '2xl': '0 25px 50px color-mix(in oklch, var(--foreground) 15%, transparent)',
        'glow': '0 0 20px color-mix(in oklch, var(--primary) 20%, transparent)',
        'glow-lg': '0 0 40px color-mix(in oklch, var(--primary) 30%, transparent)',
        'glass': '0 8px 32px color-mix(in oklch, var(--primary) 4%, transparent)',
        'glass-lg': '0 16px 48px color-mix(in oklch, var(--primary) 6%, transparent)',
      },
      
      // Enhanced border radius system
      borderRadius: {
        'xs': '0.125rem',
        'sm': '0.25rem',
        'md': '0.375rem',
        'lg': '0.5rem',
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      
      // Transition timing functions
      transitionTimingFunction: {
        'bounce-in': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'smooth': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'swift': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      
      // Enhanced transforms
      scale: {
        '102': '1.02',
        '105': '1.05',
      },
      
      // Z-index system
      zIndex: {
        '60': '60',
        '70': '70',
        '80': '80',
        '90': '90',
        '100': '100',
      },
    },
  },
  plugins: [
    require("@tailwindcss/typography"),
    require("tailwindcss-animate"),
  ],
  experimental: {
    externalDependencies: ["**/*.css"],
  },
};

export default config;