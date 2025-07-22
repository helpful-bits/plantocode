/**
 * UI Component Library Index
 *
 * This file exports all reusable UI components for the desktop application.
 * These components form a consistent design system and should be used across
 * the application wherever possible.
 *
 * Components are organized into logical groups for better discoverability.
 */

// Base UI elements
export * from "./button";
export * from "./input";
export * from "./textarea";
export * from "./label";
export * from "./select";
export * from "./checkbox";
export * from "./switch";
export * from "./slider";
export * from "./badge";
export * from "./typography";
export * from "./separator";

// Containers and layout
export * from "./card";
export * from "./data-card";
export * from "./scroll-area";
export * from "./tabs";
export * from "./collapsible";
export * from "./virtualized-code-viewer";

// Feedback and status indicators
export { Spinner } from "./loading-indicators";
export * from "./loading-indicators";
export * from "./progress";
export * from "./notification-banner";
export * from "./empty-state";
export * from "./cost-usage-indicator";
export * from "./status-messages";
export * from "./animated-number";

// Dialogs and overlays
export * from "./dialog";
export * from "./alert-dialog";
export * from "./alert";
export * from "./dropdown-menu";
export * from "./tooltip";

// Application loading and status
export * from "./app-initializing-screen";
export * from "./debug-logger";

// Application-specific shared components
export { default as DatabaseErrorHandler } from "./database-error";
export { LoadingScreen } from "./loading-screen";
export { ThemeToggle } from "./theme-toggle";

// Control toggles and sidebar components
export { FilterModeToggle } from "./filter-mode-toggle";
export { SearchScopeToggle } from "./search-scope-toggle";
export { SidebarHeader } from "./sidebar-header";
export { StatusMessages } from "./status-messages";

// Settings components
export { ModelSelector } from "../app/components/settings/model-selector";

// Terminal components
export { TerminalView } from "./TerminalView";
