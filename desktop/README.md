# PlanToCode Desktop

This is the desktop version of PlanToCode, built using Tauri.

## Terminal Restoration

The desktop app features robust terminal restoration that preserves all output when minimizing or switching windows. The system uses a DB-authoritative persistence model with UI rehydration:

- **Lossless Persistence**: All terminal output is persisted to SQLite using blocking sends to prevent data loss
- **DB Delta Catch-up**: On window restore/focus, the app fetches missed output from the database
- **Smart UI Suspension**: Terminal rendering is suspended when hidden to reduce CPU usage
- **Automatic Reflow**: Terminal content is reflowed and repainted after window restoration

To enable development trace logs for terminal restoration debugging:
```bash
NODE_ENV=development npm run dev
```

For testing terminal restoration, run: `./test-terminal-restoration.sh`

## Architecture

The desktop app consists of:

1. **Frontend**: A Vite/React application that imports and reuses components from the `core` directory
2. **Backend**: A Tauri application with Rust
3. **Database**: SQLite database managed by Tauri
4. **Server Proxy**: A Rust server that proxies API requests to LLM services

## Project Structure

```
plantocode/
├── core/               # Core application (Next.js)
│   ├── app/            # Next.js app
│   ├── components/     # UI components
│   ├── lib/            # Core functionality
│   └── types/          # TypeScript types
│
├── desktop/            # Desktop application (Tauri)
│   ├── src/            # Frontend code (Vite/React)
│   │   ├── adapters/   # Adapters for core functionality
│   │   ├── auth/       # Authentication for desktop
│   │   ├── providers/  # Context providers
│   │   └── pages/      # Desktop-specific pages
│   ├── src-tauri/      # Tauri Rust code
│   └── dist/           # Build output
│
└── server/             # Rust server for API proxying
    ├── src/            # Server code
    └── migrations/     # Database migrations
```

## Module Aliasing

The desktop app uses module aliases to import code from the core application:

- `@core/*` - Imports from the core directory
- `@core/lib/*` - Imports from core/lib
- `@core/components/*` - Imports from core/components
- `@core/app/*` - Imports from core/app
- `@core/types` - Imports core/types

For example:

```tsx
// Import from core
import { ThemeProvider } from "@core/components/theme-provider";
import { AppShell } from "@core/app/components/app-shell";
import { Session } from "@core/types";
```

## Prerequisites

- Node.js (v18+)
- npm or pnpm
- Rust toolchain (rustc, cargo)
- Tauri CLI dependencies (see [Tauri Prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites/))

## Development

1. Install dependencies:

```bash
# Install all dependencies (core and desktop)
pnpm install:all

# Or from project root
pnpm install -r
```

2. Install Tauri CLI v2:

```bash
npm install -g @tauri-apps/cli@^2
```

3. Run the development server:

```bash
pnpm tauri:dev
```

## Building

To create a production build:

```bash
pnpm tauri:build
```

This will compile the Rust code and bundle the application for your platform.

The compiled binaries will be available in the `desktop/src-tauri/target/release` directory.

## Important Notes

- This project uses Tauri 2.x - make sure you have the right version of the Tauri CLI installed
- The permissions model has been updated to use Tauri's capability-based permissions system

## Features

- Local file system access via Tauri's API
- User authentication via Auth0
- Secure token storage using Tauri's Stronghold plugin
- LLM API access via the cloud server
- Reuses UI components from the core application

## Task Description Input Stability

### Overview
The Task Description textarea implements a comprehensive cursor stability and input latency optimization system to ensure smooth, uninterrupted typing even when background processes attempt to update the field.

### Architecture

#### Two-Layer Defense System

**1. External Update Gate (Parent Level - TaskSection)**
Remote updates to `session.taskDescription` are deferred while the textarea is focused or the user is actively typing:
- **Typing Detection**: 200ms idle threshold via `isUserTypingRef` and `typingIdleTimerRef`
- **Pending Queue**: Background updates are stored in `pendingRemoteValueRef` instead of immediately applied
- **Flush on Idle**: Queued updates are applied when typing stops or on blur, using `handle.setValue(value, preserveSelection=true)`
- **Session Switch**: Always applies new session's task description immediately and clears queue

**2. Selection Preservation (Component Level - TaskDescriptionArea)**
The input component maintains cursor position through prop-driven updates:
- **Selection Tracking**: Captures caret position via `onBeforeInput`, `onSelect`, and `selectionchange` listener
- **IME Safety**: Respects `compositionstart`/`compositionend` to avoid interfering with IME input
- **Restoration**: Uses `requestAnimationFrame` to restore selection after React re-renders, clamped to new value length
- **Internal vs External**: Distinguishes user-initiated changes from prop updates to avoid unnecessary restoration

#### Performance Characteristics
- **Input Latency**: Sub-16ms key-to-paint on modern hardware (AC-1/NFR-1)
- **Backend Sync**: Debounced at 300ms to batch updates and reduce backend load
- **Typing Idle**: 200ms threshold matches human typing cadence (balances responsiveness vs noise)

### Background Update Sources

All background processes that may update `taskDescription` are routed through the gate:

| Source | Event/Method | Gating Mechanism |
|--------|-------------|------------------|
| Session sync (mobile/remote) | `history-state-changed` (kind: `task`) | → `updateCurrentSessionFields` → TaskSection gate |
| Web search findings | `apply-web-search-to-task-description` | → Component `handleValueChange` → TaskSection gate |
| Video analysis results | `apply-text-to-task-description` | → Component `handleValueChange` → TaskSection gate |
| Text improvement AI | TextImprovementProvider | → `updateCurrentSessionFields` → TaskSection gate |
| Manual undo/redo | TaskContext actions | → `updateCurrentSessionFields` → TaskSection gate |

### Integrating New Background Writers

When adding new features that may update the task description:

1. **Preferred**: Update session state via `sessionActions.updateCurrentSessionFields({ taskDescription: newValue })`
   - Automatically respects the gate
   - Preserves cursor position
   - Maintains audit trail

2. **Alternative**: Use `TaskDescriptionHandle` methods (if you have a ref to the component)
   - `handle.setValue(newValue, preserveSelection=true)` for full replacement
   - `handle.insertTextAtCursorPosition(text)` for insertion at caret
   - `handle.appendText(text)` for appending at end

3. **Never**: Directly manipulate `textarea.value` via DOM during active typing
   - Bypasses React's controlled component model
   - Causes cursor jumps and state inconsistencies
   - Will be rejected by the component's internal guards

### Development & Debugging

#### Latency Measurement
Enable input latency instrumentation in development:
```javascript
// In browser console
window.__DEBUG_INPUT_LATENCY__ = true;
```
This logs key-to-paint latency for any keystrokes over 16ms, helping identify performance regressions.

#### Common Issues
- **Cursor jumps to end**: Background update bypassed the gate → verify it uses `updateCurrentSessionFields`
- **Input lag (>16ms)**: Heavy work in keystroke path → move to debounced callback or background job
- **Lost updates**: Pending update overwritten by newer user edit → working as intended (user input takes precedence)

### Open Questions
- **OPEN-1**: Confirm maximum acceptable key→paint latency target per platform (currently 16ms default)
- **OPEN-2**: Enumerate ALL background processes that may update taskDescription for comprehensive audit
- **OPEN-3**: Identify specific historical events/timers that caused cursor jumps for targeted regression tests

## Performance Optimization

This desktop application has been optimized for responsiveness and efficiency. Key optimizations include:

- **Virtualized File Browser**: Only visible rows are rendered, enabling smooth handling of projects with 1000+ files
- **Optimistic Updates**: File selections and text inputs update immediately with debounced persistence
- **Memoization**: Components skip unnecessary re-renders using React.memo with custom comparators
- **Single-source Debouncing**: Centralized debouncing prevents redundant backend calls

For detailed validation procedures, see [PERFORMANCE_VALIDATION.md](./PERFORMANCE_VALIDATION.md).
