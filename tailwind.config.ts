import type { Config } from "tailwindcss"
import typography from "@tailwindcss/typography"
import defaultTheme from "tailwindcss/defaultTheme"
import { SCREENS } from "./src/lib/design/breakpoints"
import { FONT_SIZE } from "./src/lib/design/type-scale"

export default {
    darkMode: ["class"],
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	// Shared with useMediaQuery (src/lib/design/breakpoints.ts).
  	screens: SCREENS,
  	extend: {
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			brand: {
  				DEFAULT: 'hsl(var(--brand))',
  				'2': 'hsl(var(--brand-2))'
  			},
  			spark: 'hsl(var(--spark))',
  			success: 'hsl(var(--success))',
  			warning: 'hsl(var(--warning))',
  			kind: {
  				vending: 'hsl(var(--kind-vending))',
  				shop: 'hsl(var(--kind-shop))',
  				event: 'hsl(var(--kind-event))'
  			},
  			me: 'hsl(var(--me))',
  			map: {
  				water: 'hsl(var(--map-water))',
  				land: 'hsl(var(--map-land))',
  				line: 'hsl(var(--map-line))',
  				unsupported: 'hsl(var(--map-unsupported))',
  				'unsupported-line': 'hsl(var(--map-unsupported-line))',
  				'choro-hi': 'hsl(var(--map-choro-hi))',
  				'dot-ring': 'hsl(var(--map-dot-ring))',
  				radius: 'hsl(var(--map-radius))'
  			},
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		borderRadius: {
  			xl: 'calc(var(--radius) + 4px)',
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		fontFamily: {
  			sans: ['var(--font-sans)', ...defaultTheme.fontFamily.sans],
  			mono: ['var(--font-mono)', ...defaultTheme.fontFamily.mono]
  		},
  		/*
  		 * Type scale from the redesign prototype. Use these instead of
  		 * text-5xl/text-sm/etc. so headings, body and captions stay consistent.
  		 */
  		// Type scale: src/lib/design/type-scale.ts (shared with cn()).
  		fontSize: FONT_SIZE,
  		keyframes: {
  			'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
  			'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } }
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		},
  		/*
  		 * Elevation from the redesign prototype, themed for light and dark.
  		 * These replace Tailwind's sm/md/lg/xl (xl is for drawers and side
  		 * panels); plain `shadow` maps to the lightest level. Being var()
  		 * values, they can't take a color modifier such as shadow-lg
  		 * shadow-indigo-600/10; use an arbitrary shadow with a token instead.
  		 */
  		boxShadow: {
  			sm: 'var(--shadow-sm)',
  			DEFAULT: 'var(--shadow-sm)',
  			md: 'var(--shadow-md)',
  			lg: 'var(--shadow-lg)',
  			xl: 'var(--shadow-xl)'
  		}
  	}
  },
  plugins: [typography, require("tailwindcss-animate")],
} satisfies Config
