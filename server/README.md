# Vibe Manager Server

This is the backend server for Vibe Manager, built with Rust and Actix Web.

## Features

- REST API endpoints with Actix Web
- PostgreSQL database integration with SQLx
- Firebase-based OAuth authentication (Google, GitHub, Apple, Microsoft)
- JWT token issuance and validation
- Token binding for enhanced security
- Environment-based configuration
- Comprehensive error handling
- Database connection pooling

## Setup

### Prerequisites

- Rust (latest stable version)
- PostgreSQL
- Firebase project with authentication enabled
- SQLx CLI (for database migrations)

### Installation

1. Clone the repository
2. Navigate to the server directory
3. Copy the example environment file and update it:

```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Create a database in PostgreSQL:

```bash
createdb vibe_manager
```

5. Run database migrations:

```bash
sqlx migrate run
```

6. Build and run the server:

```bash
cargo run
```

### Environment Variables

- `APP_NAME`: Application name (default: "vibe-manager")
- `ENVIRONMENT`: Environment (e.g., "development", "production")
- `SERVER_HOST`: Host to bind the server to (default: "0.0.0.0")
- `SERVER_PORT`: Port to listen on (default: 8080)
- `CORS_ORIGINS`: Comma-separated list of allowed origins for CORS (default: "*")
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret key for JWT signing (must be at least 32 characters)
- `JWT_ACCESS_TOKEN_DURATION_DAYS`: Duration of access tokens in days (default: 30)
- `FIREBASE_API_KEY`: Your Firebase project API key
- `FIREBASE_PROJECT_ID`: Your Firebase project ID

## Authentication Flow

Vibe Manager uses Firebase Authentication for OAuth sign-in:

1. The client authenticates with Firebase using one of the supported providers (Google, GitHub, Apple, Microsoft)
2. The client sends the Firebase ID token to the server endpoint `/auth/firebase/token`
3. The server verifies the token with Firebase, extracts the user information, and issues a JWT token
4. The client includes this JWT token in the Authorization header for subsequent API requests
5. Protected endpoints validate the JWT token and extract user information

## API Endpoints

### Public Endpoints

- `GET /health`: Health check endpoint
- `POST /auth/firebase/token`: Exchange a Firebase ID token for a JWT token

### Protected Endpoints (requires authentication)

- Protected API endpoints are available under `/api`
- Authentication is required via Bearer token in the Authorization header

## Development

To run the server in development mode with hot reloading:

```bash
cargo watch -x run
```

## Testing

To run the tests:

```bash
cargo test
```