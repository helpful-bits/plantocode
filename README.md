# PlanToCode

AI-powered coding assistant that helps you plan and implement code changes. Generate implementation plans from voice, video, or text descriptions.

## Features

- **Voice & Video Input** - Describe your coding task by speaking or recording your screen
- **AI-Powered Planning** - Get detailed implementation plans with step-by-step instructions
- **Multi-Platform** - Desktop (macOS, Windows, Linux), iOS, and web
- **Multiple AI Models** - Support for Claude, GPT-4, Gemini, and more via OpenRouter

## Project Structure

```
plantocode/
├── desktop/            # Desktop application (Tauri + Next.js)
├── mobile/             # iOS application (Swift)
├── website/            # Marketing website (Next.js)
├── server/             # Backend server (Rust)
├── infrastructure/     # Deployment configs (Ansible)
└── docs/               # Documentation
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/) (v8+)
- [Rust](https://www.rust-lang.org/) (stable)
- [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)

### Installation

```bash
# Clone the repository
git clone https://github.com/helpful-bits/plantocode.git
cd plantocode

# Install dependencies
pnpm install -r
```

### Development

#### Server

The server handles authentication, billing, and proxies AI requests.

```bash
cd server

# Copy environment template
cp .env.example .env
# Edit .env with your API keys

# Run the server
cargo run
```

Required environment variables:
- `OPENROUTER_API_KEY` - For AI model access via [OpenRouter](https://openrouter.ai/)
- `AUTH0_DOMAIN`, `AUTH0_API_AUDIENCE` - For authentication
- `DATABASE_URL` - PostgreSQL connection string

#### Desktop Application

```bash
cd desktop
pnpm tauri:dev
```

#### Website

```bash
cd website
pnpm dev
```

## Building

### Desktop

```bash
cd desktop
pnpm tauri:build
```

### Server

```bash
cd server
cargo build --release
```

### Website

```bash
cd website
pnpm build
```

## Architecture

PlanToCode uses a client-server architecture:

1. **Desktop/Mobile Apps** - Native applications that provide the user interface
2. **Server** - Rust backend handling:
   - Authentication (Auth0)
   - AI request proxying (OpenRouter)
   - Usage tracking and billing (Stripe)
   - Data persistence (PostgreSQL)
3. **AI Integration** - All AI requests go through OpenRouter, supporting multiple providers

## Self-Hosting

See the [infrastructure documentation](./infrastructure/README.md) for deployment guides using Ansible.

## License

This project is licensed under the [Functional Source License, Version 1.1, Apache 2.0 Future License](./LICENSE).

- **Free to use** for personal and internal business purposes
- **Cannot compete** with PlanToCode's commercial offering
- **Converts to Apache 2.0** on January 1, 2030

## Contributing

Contributions are welcome! Please open an issue to discuss your proposed changes before submitting a PR.

## Support

- [Website](https://www.plantocode.com)
- [Issues](https://github.com/helpful-bits/plantocode/issues)
