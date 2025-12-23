#!/usr/bin/env python3
"""
Proper OKLCH to RGB color conversion for Vibe Manager
"""

import math
from pptx.dml.color import RGBColor

def oklch_to_rgb(l, c, h):
    """
    Convert OKLCH to RGB

    Args:
        l: Lightness (0-1)
        c: Chroma (0-0.4 typically)
        h: Hue (0-360 degrees)

    Returns:
        RGBColor object
    """
    # Convert hue to radians
    h_rad = math.radians(h)

    # Convert OKLCH to OKLab
    a = c * math.cos(h_rad)
    b = c * math.sin(h_rad)

    # OKLab to linear RGB (simplified but accurate enough)
    # Using the official OKLab conversion matrix
    l_ = l + 0.3963377774 * a + 0.2158037573 * b
    m_ = l - 0.1055613458 * a - 0.0638541728 * b
    s_ = l - 0.0894841775 * a - 1.2914855480 * b

    l = l_ * l_ * l_
    m = m_ * m_ * m_
    s = s_ * s_ * s_

    # Linear RGB
    r_lin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g_lin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b_lin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

    # Apply gamma correction (sRGB)
    def gamma_correct(x):
        if x <= 0.0031308:
            return 12.92 * x
        else:
            return 1.055 * math.pow(x, 1/2.4) - 0.055

    r = gamma_correct(r_lin)
    g = gamma_correct(g_lin)
    b = gamma_correct(b_lin)

    # Clamp to [0, 1] and convert to 0-255
    r = max(0, min(255, int(r * 255 + 0.5)))
    g = max(0, min(255, int(g * 255 + 0.5)))
    b = max(0, min(255, int(b * 255 + 0.5)))

    return RGBColor(r, g, b)

# Exact colors from desktop/src/app/globals.css - Dark Mode
COLORS = {
    # Backgrounds
    'BG_NAVY': oklch_to_rgb(0.18, 0.02, 206),           # oklch(0.18 0.02 206)
    'BG_CARD': oklch_to_rgb(0.22, 0.02, 206),           # oklch(0.22 0.02 206)
    'BG_ELEVATED': oklch_to_rgb(0.24, 0.02, 206),       # oklch(0.24 0.02 206)
    'BG_SECONDARY': oklch_to_rgb(0.28, 0.02, 206),      # oklch(0.28 0.02 206)
    'BG_MUTED': oklch_to_rgb(0.24, 0.02, 206),          # oklch(0.24 0.02 206)
    'BG_POPOVER': oklch_to_rgb(0.20, 0.02, 206),        # oklch(0.20 0.02 206)
    'BG_INPUT': oklch_to_rgb(0.26, 0.02, 206),          # oklch(0.26 0.02 206)

    # Primary (Teal)
    'TEAL_PRIMARY': oklch_to_rgb(0.65, 0.08, 195),      # oklch(0.65 0.08 195) - #5FB1BE
    'TEAL_DARK': oklch_to_rgb(0.52, 0.09, 195),         # oklch(0.52 0.09 195) - #0F7E8C
    'TEAL_FOREGROUND': oklch_to_rgb(0.12, 0.02, 206),   # oklch(0.12 0.02 206)

    # Text colors
    'TEXT_PRIMARY': oklch_to_rgb(0.9, 0, 0),            # oklch(0.9 0 0)
    'TEXT_SECONDARY': oklch_to_rgb(0.82, 0, 0),         # oklch(0.82 0 0)
    'TEXT_MUTED': oklch_to_rgb(0.62, 0, 0),             # oklch(0.62 0 0)

    # Borders
    'BORDER': oklch_to_rgb(0.34, 0.02, 206),            # oklch(0.34 0.02 206)
    'BORDER_MODAL': oklch_to_rgb(0.30, 0.05, 195),      # oklch(0.30 0.05 195)

    # Accent
    'ACCENT': oklch_to_rgb(0.3, 0.03, 195),             # oklch(0.3 0.03 195)
    'ACCENT_FOREGROUND': oklch_to_rgb(0.85, 0, 0),      # oklch(0.85 0 0)

    # Status colors
    'DESTRUCTIVE': oklch_to_rgb(0.6, 0.22, 25),         # oklch(0.6 0.22 25)
    'DESTRUCTIVE_FG': oklch_to_rgb(0.9, 0.01, 25),      # oklch(0.9 0.01 25)

    'WARNING': oklch_to_rgb(0.65, 0.15, 65),            # oklch(0.65 0.15 65)
    'WARNING_FG': oklch_to_rgb(0.95, 0.02, 65),         # oklch(0.95 0.02 65)
    'WARNING_BG': oklch_to_rgb(0.2, 0.08, 65),          # oklch(0.2 0.08 65)
    'WARNING_BORDER': oklch_to_rgb(0.4, 0.12, 65),      # oklch(0.4 0.12 65)

    'INFO': oklch_to_rgb(0.6, 0.12, 220),               # oklch(0.6 0.12 220)
    'INFO_FG': oklch_to_rgb(0.95, 0.02, 220),           # oklch(0.95 0.02 220)
    'INFO_BG': oklch_to_rgb(0.2, 0.06, 220),            # oklch(0.2 0.06 220)
    'INFO_BORDER': oklch_to_rgb(0.4, 0.08, 220),        # oklch(0.4 0.08 220)

    'SUCCESS': oklch_to_rgb(0.45, 0.08, 145),           # oklch(0.45 0.08 145)
    'SUCCESS_FG': oklch_to_rgb(0.88, 0.01, 145),        # oklch(0.88 0.01 145)
    'SUCCESS_BG': oklch_to_rgb(0.16, 0.04, 145),        # oklch(0.16 0.04 145)
    'SUCCESS_BORDER': oklch_to_rgb(0.3, 0.06, 145),     # oklch(0.3 0.06 145)
}

def print_color_conversions():
    """Print all color conversions for verification"""
    print("\n" + "="*70)
    print("OKLCH to RGB Conversions - Vibe Manager Dark Mode")
    print("="*70 + "\n")

    for name, rgb_color in COLORS.items():
        # Access RGB values from RGBColor object
        r = rgb_color._r
        g = rgb_color._g
        b = rgb_color._b
        print(f"{name:25s} -> RGB({r:3d}, {g:3d}, {b:3d})  #{r:02X}{g:02X}{b:02X}")

    print("\n" + "="*70 + "\n")

if __name__ == '__main__':
    print_color_conversions()
