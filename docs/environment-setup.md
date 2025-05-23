# Environment Variable Setup for Vibe Manager

This document provides guidance on configuring environment variables for the Vibe Manager application. The application consists of three main components, each with its own set of environment variables:

1. Server (Rust backend API server)
2. Desktop Tauri Backend (Rust desktop backend)
3. Desktop Frontend (Vite/React application)

## Server Environment Variables

Create or update `server/.env` with the following variables:

```bash
# Server Application Configuration
APP_NAME=vibe-manager
ENVIRONMENT=development # Or 'production', 'staging'
RUST_LOG=debug

# Database Configuration (Mandatory)
DATABASE_URL=postgresql://username:password@host:port/database

# Server Network Configuration
SERVER_HOST=0.0.0.0
SERVER_PORT=8080
CORS_ORIGINS=* # Comma-separated list of allowed origins, or '*' for all
SERVER_URL=http://localhost:8080 # Full URL for the server, used in various services

# API Keys (Mandatory unless specified)
OPENROUTER_API_KEY=your_openrouter_api_key_here # For proxying LLM and transcription requests

# Firebase Configuration (For hybrid authentication flow)
FIREBASE_API_KEY=your_firebase_api_key # Firebase Web SDK API Key
FIREBASE_PROJECT_ID=your_firebase_project_id # Firebase Project ID
FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com # Firebase Auth Domain
FIREBASE_ALLOWED_DOMAINS=*.firebaseapp.com,*.web.app # Domains allowed to authenticate via Firebase OAuth
FIREBASE_STORE_REFRESH_TOKENS=true # Whether to store Firebase refresh tokens

# Authentication Configuration (Mandatory)
JWT_SECRET=a_very_strong_and_long_random_secret_key_for_jwt # Secret key for signing JWTs
JWT_ACCESS_TOKEN_DURATION_DAYS=30 # How long JWTs are valid

# Rate Limiting Configuration
RATE_LIMIT_WINDOW_MS=60000 # Window for rate limiting in milliseconds (1 minute)
RATE_LIMIT_MAX_REQUESTS=100 # Max requests per window per IP

# Subscription Configuration
DEFAULT_TRIAL_DAYS=7 # Default trial period in days for new users

# Stripe Configuration (For billing features)
STRIPE_SECRET_KEY=sk_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret_here
STRIPE_PRICE_ID_FREE=price_xxxxxxxxxxxxxx # Optional: Stripe Price ID for the free plan
STRIPE_PRICE_ID_PRO=price_xxxxxxxxxxxxxx # Optional: Stripe Price ID for the pro plan
STRIPE_PRICE_ID_ENTERPRISE=price_xxxxxxxxxxxxxx # Optional: Stripe Price ID for the enterprise plan

# Deep Link Configuration (Used for Stripe checkout callbacks)
APP_DEEP_LINK_SCHEME=vibe-manager # Scheme used by the desktop app for deep linking
```

## Desktop Tauri Backend Environment Variables

Create or update `desktop/src-tauri/.env` with the following variables:

```bash
# Environment file for Vibe Manager Desktop Rust backend

# Main Server URL (required for auth and API calls)
MAIN_SERVER_BASE_URL=http://localhost:8080

# Tauri development server URL
VITE_TAURI_DEV_SERVER_URL=http://localhost:1420

# Logging level
RUST_LOG=info,vibe_manager=debug
```

## Desktop Frontend Environment Variables

Create or update `desktop/.env` with the following variables:

```bash
# URL of the Vibe Manager Server
VITE_MAIN_SERVER_BASE_URL=http://localhost:8080

# --- Additional variables for development ---

# Tauri development server host
VITE_TAURI_DEV_HOST=localhost

# Tauri development server URL
VITE_TAURI_DEV_SERVER_URL=http://localhost:1420

# Rust logging configuration
RUST_LOG=vibe_manager=debug

# The following Firebase variables are NOT used for the current hybrid web authentication flow
# They would be needed if the Vite application directly initialized the Firebase JS SDK
# VITE_FIREBASE_API_KEY=your_firebase_web_client_api_key_here
# VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
# VITE_FIREBASE_PROJECT_ID=your-project-id
# VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
# VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
# VITE_FIREBASE_APP_ID=your-app-id
# VITE_FIREBASE_MEASUREMENT_ID=your-measurement-id
```

## Important Notes on Configuration

### Firebase Authentication Setup

The Firebase authentication flow uses a hybrid approach:
1. The server hosts a web page where users authenticate with Firebase Web SDK
2. The server captures the Firebase ID token and makes it available to the desktop app
3. The desktop app exchanges this Firebase token for an application-specific JWT

To set up Firebase correctly:
1. Create a Firebase project in the [Firebase Console](https://console.firebase.google.com/)
2. Enable Authentication and add the desired providers (Google, GitHub, Microsoft, Apple)
3. Create a web app in your Firebase project to get the Web SDK configuration
4. Add the Firebase configuration values to the server's `.env` file
5. Ensure `SERVER_URL` is correct in the server's `.env` file

### Server URL Consistency

The same server base URL must be used in all three environment files:
- Server: `SERVER_URL` should point to the server's public URL
- Desktop Tauri Backend: `MAIN_SERVER_BASE_URL` should match `SERVER_URL` 
- Desktop Frontend: `VITE_MAIN_SERVER_BASE_URL` should match `SERVER_URL`

### Environment Example Files

Each component has an `.env.example` file that should be used as a template:
- `server/.env.example` for the server
- `desktop/src-tauri/.env.example` for the desktop Tauri backend
- `desktop/.env.example` for the desktop frontend

Never commit actual `.env` files to version control, only the example files.