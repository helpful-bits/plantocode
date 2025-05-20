import { type CSSProperties } from "react";

/**
 * UI-related utilities for consistent styling and layout management
 */

// Sidebar constants
export const SIDEBAR_COLLAPSED_WIDTH = "48px";
export const SIDEBAR_EXPANDED_WIDTH = "320px";
export const SIDEBAR_CSS_VAR_NAME = "--sidebar-width";

/**
 * Sets the sidebar width CSS variable based on collapsed state
 * @param collapsed Whether the sidebar is collapsed
 */
export function setSidebarWidth(collapsed: boolean): void {
  document.documentElement.style.setProperty(
    SIDEBAR_CSS_VAR_NAME,
    collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH
  );
}

/**
 * Gets the sidebar style object for consistent styling
 * @param collapsed Whether the sidebar is collapsed
 * @returns Style object for the sidebar
 */
export function getSidebarStyle(collapsed: boolean): CSSProperties {
  return {
    width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
    transition: "width 300ms ease-in-out",
    transform: "translate3d(0, 0, 0)",
    backfaceVisibility: "hidden",
    willChange: "width",
    position: "fixed",
    left: 0,
    top: 0,
    height: "100vh",
    overflow: "hidden",
  };
}

/**
 * Type-safe version of CSS variable values
 */
export interface CSSVars {
  [SIDEBAR_CSS_VAR_NAME]: string;
  // Add more CSS variables as needed
}

/**
 * Sets a CSS variable with type checking
 */
export function setCSSVariable<K extends keyof CSSVars>(
  name: K,
  value: CSSVars[K]
): void {
  document.documentElement.style.setProperty(name, value);
}
