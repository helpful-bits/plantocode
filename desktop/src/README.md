# Vibe Manager Desktop Source

This directory contains the source code for the desktop application, including shared UI components, styles, and utilities.

## Structure

- `/app` - Main application components and pages
- `/components` - Application-specific components
- `/ui` - Shared UI components based on shadcn/ui
- `/styles` - Global styles and CSS variables
- `/contexts` - React contexts for state management
- `/actions` - Server actions for data manipulation
- `/adapters` - Adapter layer for external services
- `/hooks` - Custom React hooks
- `/utils` - Utility functions
- `/types` - TypeScript type definitions
- `/tailwind.config.base.ts` - Base Tailwind configuration
- `/tailwind.config.ts` - Application Tailwind configuration

## UI Components Architecture

### Components Organization

The UI components are organized into two main categories:

1. **Shared UI Components** - Located in `/ui` directory:

   - Base components with consistent styling
   - Used across the entire application
   - Exported through `/ui/index.ts`

2. **Application-specific Components** - Located in `/app/components` and `/components`:
   - Feature-specific components
   - Complex compositions of shared UI components
   - Components that manage application state

### Importing UI Components

```tsx
// Import shared UI components
import { Button, Card, Input } from "@desktop/ui";

// Use components with consistent styling
function MyComponent() {
  return (
    <Card>
      <h3>Example Component</h3>
      <Input placeholder="Enter text" />
      <Button>Submit</Button>
    </Card>
  );
}
```

### Styling with Tailwind CSS

The application uses Tailwind CSS for styling, with a consistent theme defined in the base configuration:

```tsx
// In app/globals.css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Import shared global styles */
@import "../styles/globals.css";
```

## Development Guidelines

### Adding New Components

1. For shared UI components:

   - Create component in `/ui` directory following shadcn/ui patterns
   - Export component in `/ui/index.ts`
   - Use theme variables consistently
   - Support both light and dark modes

2. For application-specific components:
   - Create component in `/app/components` or `/components` directory
   - Use shared UI components as building blocks
   - Implement feature-specific logic and state management

### State Management Architecture

1. **Global State**:

   - Use React Contexts in `/contexts` directory
   - Split state and actions for better separation of concerns
   - Export state through context hooks like `useSessionStateContext`

2. **Feature-specific State**:
   - Implement in feature-specific hooks (e.g., `use-generate-prompt-core-state.ts`)
   - Connect to global state as needed
   - Maintain local state for immediate UI feedback

### Tailwind Theme Usage

Use theme variables consistently for better dark mode support:

```tsx
// Correct usage of theme variables
<div className="bg-background text-foreground border-border" />

// For dynamic values:
<div className={cn("bg-primary", {
  "bg-destructive": isError,
  "bg-muted": isDisabled
})} />
```

### Theme Variables

Use CSS variables for theming to ensure dark mode support:

```tsx
// Use theme variables in components
<div className="bg-background text-foreground" />

// For custom styles that need theme support:
<div style={{
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)'
}} />
```

### Component Architecture

- Use Tailwind CSS for styling
- Implement both light and dark mode variants
- Support responsive layouts
- Follow accessibility best practices
- Compose complex components from simpler ones

### Desktop Environment Detection

To detect if the application is running in the desktop environment, use the `isTauriEnvironment()` utility function from `@/utils/platform`. This utility checks for Tauri's global variables (`window.__TAURI_IPC__` and `window.__TAURI_INTERNALS__`) to determine if the app is running in a Tauri environment.

```tsx
import { isTauriEnvironment } from "@/utils/platform";

function ConditionalComponent() {
  if (isTauriEnvironment()) {
    return <DesktopSpecificFeature />;
  }
  
  return <WebFeature />;
}
```

This provides a reliable way to conditionally render features that are only available in the desktop environment without relying on custom global markers.

## Setup in New Project

To use this shared package in a new project:

1. Add package to workspace dependencies:

```json
"dependencies": {
  "@shared": "workspace:*"
}
```

2. Configure path aliases in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@shared/*": ["../shared/src/*"]
    }
  }
}
```

3. Configure build system (webpack, vite, etc.) to resolve aliases correctly
4. Import and use components as described above

## License

Internal use only - all rights reserved.
