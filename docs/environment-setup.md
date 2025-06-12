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
SERVER_URL=http://localhost:8080 # Full URL for the server. CRITICAL for Auth0 redirect flow.

# API Keys (Mandatory unless specified)
OPENROUTER_API_KEY=your_openrouter_api_key_here # For proxying LLM requests
REPLICATE_API_TOKEN=your_replicate_api_token_here # For streaming transcription

# Auth0 Configuration (Mandatory)
AUTH0_DOMAIN="your-auth0-tenant.auth0.com"
AUTH0_API_AUDIENCE="https://vibemanager.app"
# Mandatory: Auth0 Machine-to-Machine (M2M) application Client ID for server-side refresh token exchange.
AUTH0_SERVER_CLIENT_ID="your_auth0_server_m2m_app_client_id"
# Mandatory: Auth0 Machine-to-Machine (M2M) application Client Secret for server-side refresh token exchange.
AUTH0_SERVER_CLIENT_SECRET="your_auth0_server_m2m_app_client_secret"
SERVER_AUTH0_CALLBACK_URL="http://localhost:8080/auth/auth0/callback"
SERVER_AUTH0_LOGGED_OUT_URL="http://localhost:8080/auth/auth0/logged-out"

# Authentication Configuration (Mandatory)
JWT_SECRET=a_very_strong_and_long_random_secret_key_for_jwt # Secret key for signing JWTs
JWT_ACCESS_TOKEN_DURATION_DAYS=30 # How long JWTs are valid

# Rate Limiting Configuration
RATE_LIMIT_WINDOW_MS=60000 # Window for rate limiting in milliseconds (1 minute)
RATE_LIMIT_MAX_REQUESTS=100 # Max requests per window per IP
RATE_LIMIT_USE_REDIS=false # Set to true to use Redis for distributed rate limiting across multiple instances
RATE_LIMIT_REDIS_URL=redis://localhost:6379 # Redis connection URL (required if RATE_LIMIT_USE_REDIS=true)
RATE_LIMIT_CLEANUP_INTERVAL_SECS=300 # Interval in seconds for cleaning up in-memory rate limit stores

# Auth Store Configuration
POLLING_STORE_EXPIRY_MINS=30 # Expiry time for auth polling store entries
AUTH0_STATE_STORE_EXPIRY_MINS=30 # Expiry time for Auth0 state store entries
AUTH_STORE_CLEANUP_INTERVAL_SECS=300 # Interval for cleaning up expired auth store entries

# Subscription Configuration
DEFAULT_TRIAL_DAYS=7 # Default trial period in days for new users

# Stripe Configuration (Mandatory for billing features)
STRIPE_SECRET_KEY=sk_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret_here
# Stripe checkout and portal redirect URLs (point to your frontend)
STRIPE_CHECKOUT_SUCCESS_URL="http://localhost:1420/account?checkout=success"
STRIPE_CHECKOUT_CANCEL_URL="http://localhost:1420/account?checkout=canceled"
STRIPE_PORTAL_RETURN_URL="http://localhost:1420/account"

# Deep Link Configuration (Used for Stripe checkout callbacks)
APP_DEEP_LINK_SCHEME=vibe-manager # Scheme used by the desktop app for deep linking
```

## Desktop Tauri Backend Environment Variables

Create or update `desktop/src-tauri/.env` with the following variables:

```bash
# Environment file for Vibe Manager Desktop Rust backend

# Main Server URL (required for auth and API calls)
MAIN_SERVER_BASE_URL=http://localhost:8080

# Auth0 Configuration
AUTH0_DOMAIN="your-auth0-tenant.auth0.com"
AUTH0_NATIVE_CLIENT_ID="your_auth0_native_app_client_id"
AUTH0_API_AUDIENCE="https://vibemanager.app"
SERVER_AUTH0_INITIATE_LOGIN_URL="http://localhost:8080/auth/auth0/initiate-login"
SERVER_AUTH0_CALLBACK_URL="http://localhost:8080/auth/auth0/callback"
SERVER_AUTH0_POLL_STATUS_URL="http://localhost:8080/auth0/poll-status"
SERVER_AUTH0_FINALIZE_LOGIN_URL="http://localhost:8080/auth0/finalize-login"
SERVER_AUTH0_REFRESH_APP_TOKEN_URL="http://localhost:8080/api/auth0/refresh-app-token"
SERVER_AUTH0_LOGGED_OUT_URL="http://localhost:8080/auth/auth0/logged-out"
AUTH0_LOGOUT_URL_TEMPLATE="https://{AUTH0_DOMAIN}/v2/logout?client_id={AUTH0_NATIVE_CLIENT_ID}&returnTo={SERVER_AUTH0_LOGGED_OUT_URL}"

# Tauri development server URL - Must match the devUrl in tauri.conf.json
VITE_TAURI_DEV_SERVER_URL=http://localhost:1420

# Logging level
RUST_LOG=info,vibe_manager=debug
```

## Desktop Frontend Environment Variables

Create or update `desktop/.env` with the following variables:

```bash
# URL of the Main Server - Used for API calls and authentication polling
# CRITICAL: This URL is used by the Vite frontend for API calls and must match your main backend server
# Example for local development: http://localhost:8080
# Example for production: https://your-production-server.com
VITE_MAIN_SERVER_BASE_URL=http://localhost:8080

# --- Additional variables for development ---

# Tauri development server host
VITE_TAURI_DEV_HOST=localhost

# Tauri development server URL - Must match the devUrl in desktop/src-tauri/tauri.conf.json
VITE_TAURI_DEV_SERVER_URL=http://localhost:1420

# Rust logging configuration (matches setting in Tauri backend)
RUST_LOG=vibe_manager=debug

# Auth0 configuration is handled entirely by the Tauri backend
# No frontend environment variables needed for Auth0 authentication
# See desktop/src-tauri/.env.example for Auth0 configuration
```

## Important Notes on Configuration

### Auth0 Authentication Setup

The Auth0 authentication flow uses a hybrid desktop approach:
1. The desktop app initiates login by opening the user's browser to the server's Auth0 login endpoint
2. The user authenticates with Auth0 in their browser
3. The server handles the Auth0 callback and creates a polling entry
4. The desktop app polls the server for the authentication result
5. Once successful, the desktop app receives an application-specific JWT

To set up Auth0 correctly:

1. **Create an Auth0 Application**:
   - Create a new **Native Application** in your [Auth0 Dashboard](https://manage.auth0.com/)
   - Note the Domain and Client ID for the native app

2. **Create a Machine-to-Machine Application**:
   - Create a **Machine-to-Machine Application** for server-side token management
   - Authorize it for your Auth0 Management API
   - Note the Client ID and Client Secret for the M2M app

3. **Configure Callback URLs**:
   - In your Native Application settings, add your server's callback URL to "Allowed Callback URLs"
   - Example: `http://localhost:8080/auth/auth0/callback`

4. **Configure Logout URLs**:
   - Add your server's logout URL to "Allowed Logout URLs"
   - Example: `http://localhost:8080/auth/auth0/logged-out`

5. **Update Environment Variables**:
   - Use the Native Application's Domain and Client ID in the Tauri backend
   - Use the M2M Application's Client ID and Secret in the server
   - Ensure all Auth0 URLs point to your server endpoints

### Server URL Consistency

The same server base URL must be used consistently across all environment files:
- Server: `SERVER_URL` should point to the server's public URL
- Desktop Tauri Backend: `MAIN_SERVER_BASE_URL` should match `SERVER_URL` 
- Desktop Frontend: `VITE_MAIN_SERVER_BASE_URL` should match `SERVER_URL`

### Billing System Configuration

The billing system requires proper configuration of:
- **Stripe**: Secret key, webhook secret, and checkout/portal redirect URLs
- **Auth0**: For authenticated billing API requests
- **Server URLs**: For proper communication between desktop app and server

### Environment Example Files

Each component has an `.env.example` file that should be used as a template:
- `server/.env.example` for the server
- `desktop/src-tauri/.env.example` for the desktop Tauri backend
- `desktop/.env.example` for the desktop frontend

Never commit actual `.env` files to version control, only the example files.

## Quick Setup Checklist

1. ✅ Copy all `.env.example` files to `.env` files in their respective directories
2. ✅ Set up Auth0 tenant and applications (Native + Machine-to-Machine)
3. ✅ Configure PostgreSQL database and update `DATABASE_URL`
4. ✅ Add your OpenRouter API key for LLM requests
5. ✅ Add your Replicate API token for streaming transcription services
6. ✅ Configure Stripe keys for billing functionality
7. ✅ Ensure all server URLs are consistent across all `.env` files
8. ✅ Update Auth0 configuration with your tenant details