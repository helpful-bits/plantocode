# Vibe Manager

Vibe Manager is a powerful AI coding assistant that helps you write and manage code.

## Project Structure

This monorepo is organized into three main parts:

```
vibe-manager/
├── core/               # Core web application (Next.js)
├── desktop/            # Desktop application (Tauri)
└── server/             # Backend server (Rust)
```

### Core

The `core` directory contains the main web application built with Next.js. This is the foundation of the application with all the business logic, UI components, and API clients.

### Desktop

The `desktop` directory contains the Tauri-based desktop application. It imports and reuses code from the `core` application through aliases.

### Server

The `server` directory contains the Rust backend server. It provides authentication, handles proxying requests to AI services, and manages user data with PostgreSQL.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/) (v8+)
- [Rust](https://www.rust-lang.org/) (stable)
- [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)

### Installation

Install dependencies for all packages:

```bash
pnpm install -r
```

### Development

#### Option 1: Running Components Individually

Run the core web application:

```bash
cd core
pnpm dev
```

Run the server (required for desktop app):

```bash
cd server
cargo run
```

Run the desktop application (requires server running):

```bash
cd desktop
pnpm tauri:dev
```

#### Option 2: Running the Full System

For the full desktop experience, you need to run both the server and desktop app:

1. First, set up environment variables:
   - Create a `.env` file in the `server` directory using `.env.example` as a template
   - Make sure to include the required API keys (GEMINI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY)

2. Start the server:
   ```bash
   cd server
   cargo run
   ```

3. In another terminal, start the desktop app:
   ```bash
   cd desktop
   pnpm tauri:dev
   ```

The desktop app will automatically connect to the server, which will handle authentication and proxy requests to the AI services.

## Building

### Build the core web application:

```bash
cd core
pnpm build
```

### Build the desktop application:

```bash
cd desktop
pnpm tauri:build
```

### Build the server:

```bash
cd server
cargo build --release
```

## Architecture

The application follows a modular architecture:

1. The core web app contains all the UI components and business logic
2. The desktop app reuses the core app's components but provides native features through Tauri
3. The server provides authentication, proxying, and data persistence

## License

Proprietary - All rights reserved
