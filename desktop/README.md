# Vibe Manager Desktop

This is the desktop version of Vibe Manager, built using Tauri.

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
vibe-manager/
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
