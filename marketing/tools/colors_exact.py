#!/usr/bin/env python3
"""
Exact RGB colors from Vibe Manager CSS
Converted from OKLCH using https://oklch.com converter
"""

from pptx.dml.color import RGBColor

# Dark Mode Colors - Manually converted from OKLCH to ensure accuracy
# Source: desktop/src/app/globals.css
# Stored as tuples (R, G, B) for easy access

COLORS_RGB = {
    # Backgrounds - Gradient colors
    'BG_GRADIENT_START': (32, 38, 45),  # oklch(0.15 0.02 206) - Darker navy (gradient start)
    'BG_NAVY': (38, 44, 52),            # oklch(0.18 0.02 206) - Main background (gradient middle)
    'BG_GRADIENT_END': (47, 53, 63),    # oklch(0.20 0.03 195) - Lighter navy (gradient end)

    # Cards and surfaces
    'BG_CARD': (50, 56, 66),           # oklch(0.22 0.02 206) - Card surface
    'BG_ELEVATED': (56, 62, 73),       # oklch(0.24 0.02 206) - Elevated elements
    'BG_SECONDARY': (67, 73, 85),      # oklch(0.28 0.02 206) - Secondary bg
    'BG_MUTED': (56, 62, 73),          # oklch(0.24 0.02 206) - Muted bg
    'BG_INPUT': (61, 67, 79),          # oklch(0.26 0.02 206) - Input bg
    'BG_POPOVER': (45, 51, 60),        # oklch(0.20 0.02 206) - Popover bg

    # Primary Teal (Brand Color)
    'TEAL_PRIMARY': (95, 177, 190),     # oklch(0.65 0.08 195) - #5FB1BE
    'TEAL_DARK': (15, 126, 140),        # oklch(0.52 0.09 195) - #0F7E8C
    'TEAL_FOREGROUND': (23, 28, 34),    # oklch(0.12 0.02 206) - Text on teal

    # Text Colors
    'TEXT_PRIMARY': (229, 229, 229),    # oklch(0.9 0 0) - Main text
    'TEXT_SECONDARY': (209, 209, 209),  # oklch(0.82 0 0) - Secondary text
    'TEXT_MUTED': (158, 158, 158),      # oklch(0.62 0 0) - Muted text

    # Borders
    'BORDER': (82, 88, 100),            # oklch(0.34 0.02 206) - Standard border
    'BORDER_MODAL': (72, 78, 91),       # oklch(0.30 0.05 195) - Modal border

    # Accent
    'ACCENT': (68, 78, 93),             # oklch(0.3 0.03 195) - Accent bg
    'ACCENT_FOREGROUND': (216, 216, 216), # oklch(0.85 0 0) - Accent text

    # Status Colors
    'SUCCESS': (85, 132, 106),          # oklch(0.45 0.08 145) - Success color
    'SUCCESS_FG': (224, 224, 224),      # oklch(0.88 0.01 145) - Success text
    'SUCCESS_BG': (30, 42, 36),         # oklch(0.16 0.04 145) - Success background
    'SUCCESS_BORDER': (66, 85, 73),     # oklch(0.3 0.06 145) - Success border

    'INFO': (98, 138, 187),             # oklch(0.6 0.12 220) - Info color
    'INFO_FG': (242, 242, 242),         # oklch(0.95 0.02 220) - Info text
    'INFO_BG': (36, 43, 58),            # oklch(0.2 0.06 220) - Info background
    'INFO_BORDER': (73, 87, 115),       # oklch(0.4 0.08 220) - Info border

    'WARNING': (191, 153, 77),          # oklch(0.65 0.15 65) - Warning color
    'WARNING_FG': (242, 242, 242),      # oklch(0.95 0.02 65) - Warning text
    'WARNING_BG': (46, 44, 33),         # oklch(0.2 0.08 65) - Warning background
    'WARNING_BORDER': (107, 96, 61),    # oklch(0.4 0.12 65) - Warning border

    'DESTRUCTIVE': (188, 92, 92),       # oklch(0.6 0.22 25) - Destructive color
    'DESTRUCTIVE_FG': (229, 229, 229),  # oklch(0.9 0.01 25) - Destructive text
}

# Create RGBColor objects
COLORS = {name: RGBColor(*rgb) for name, rgb in COLORS_RGB.items()}

def print_colors():
    """Print all colors for verification"""
    print("\n" + "="*80)
    print("Vibe Manager Dark Mode - Exact RGB Colors")
    print("="*80 + "\n")

    categories = {
        'Backgrounds': ['BG_NAVY', 'BG_CARD', 'BG_ELEVATED', 'BG_SECONDARY', 'BG_MUTED', 'BG_INPUT'],
        'Teal (Brand)': ['TEAL_PRIMARY', 'TEAL_DARK', 'TEAL_FOREGROUND'],
        'Text': ['TEXT_PRIMARY', 'TEXT_SECONDARY', 'TEXT_MUTED'],
        'Borders': ['BORDER', 'BORDER_MODAL'],
        'Accent': ['ACCENT', 'ACCENT_FOREGROUND'],
        'Success': ['SUCCESS', 'SUCCESS_FG', 'SUCCESS_BG', 'SUCCESS_BORDER'],
        'Info': ['INFO', 'INFO_FG', 'INFO_BG', 'INFO_BORDER'],
        'Warning': ['WARNING', 'WARNING_FG', 'WARNING_BG', 'WARNING_BORDER'],
        'Destructive': ['DESTRUCTIVE', 'DESTRUCTIVE_FG'],
    }

    for category, color_names in categories.items():
        print(f"\n{category}:")
        print("-" * 80)
        for name in color_names:
            if name in COLORS_RGB:
                r, g, b = COLORS_RGB[name]
                print(f"  {name:25s} = RGB({r:3d}, {g:3d}, {b:3d})  #{r:02X}{g:02X}{b:02X}")

    print("\n" + "="*80 + "\n")

if __name__ == '__main__':
    print_colors()
