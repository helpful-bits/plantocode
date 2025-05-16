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
   - Make sure to include the required API keys:
     - `OPENROUTER_API_KEY` - API key for OpenRouter (used for all AI model access)
     - `FIREBASE_API_KEY` and `FIREBASE_PROJECT_ID` - For authentication
     - `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` - For billing/subscription functionality

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
3. The server provides authentication, billing, AI model proxying, and data persistence

### AI Integration Architecture

Vibe Manager uses a server-proxy architecture for all AI model access:

1. The desktop application communicates with the server through a `ServerProxyClient`
2. The server handles authentication, billing, and rate limiting
3. The server proxies all AI requests to OpenRouter, which provides access to various AI models
4. OpenRouter handles routing to the appropriate model provider (Anthropic, OpenAI, etc.)
5. Usage data and costs are tracked in the server's database for billing purposes

## License

Proprietary - All rights reserved
