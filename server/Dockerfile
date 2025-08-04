# Stage 1: Planner
# Use the official cargo-chef image for Alpine to calculate dependencies.
# This avoids manual setup of musl toolchain dependencies.
FROM lukemathwalker/cargo-chef:latest-rust-1-alpine AS planner
WORKDIR /app
# Copy only the manifests to optimize layer caching.
COPY Cargo.toml Cargo.lock ./
RUN cargo chef prepare --recipe-path recipe.json

# Stage 2: Cacher
# Build and cache dependencies in a separate layer. This layer is only
# rebuilt when the recipe (i.e., dependencies) changes.
FROM lukemathwalker/cargo-chef:latest-rust-1-alpine AS cacher
# Install build dependencies for Alpine
RUN apk add --no-cache musl-dev pkgconfig openssl-dev
# Set SQLx to offline mode to avoid database connection during build
ENV SQLX_OFFLINE=true
WORKDIR /app
COPY --from=planner /app/recipe.json recipe.json
# The 'cook' command builds the dependencies.
RUN cargo chef cook --release --recipe-path recipe.json

# Stage 3: Builder
# Build the application binary, linking against the pre-built dependencies.
# This layer is rebuilt whenever application source code changes.
FROM lukemathwalker/cargo-chef:latest-rust-1-alpine AS builder
# Install build dependencies for Alpine
RUN apk add --no-cache musl-dev pkgconfig openssl-dev
# Set SQLx to offline mode to avoid database connection during build
ENV SQLX_OFFLINE=true
WORKDIR /app
# Copy cached dependencies from the 'cacher' stage.
COPY --from=cacher /app/target target
COPY --from=cacher /usr/local/cargo/registry /usr/local/cargo/registry
# Copy the application source code.
COPY . .
# Build the application binary. This will be fast as dependencies are already compiled.
RUN cargo build --release --bin server

# Stage 4: Runtime
# Create a minimal and secure final image based on Alpine Linux.
FROM alpine:latest AS runtime

# Install runtime dependencies. ca-certificates for TLS support.
RUN apk add --no-cache ca-certificates

# Create a dedicated, unprivileged user and group for security.
RUN addgroup -S appgroup && adduser -S -G appgroup appuser

# Set the working directory for the application.
WORKDIR /app

# Copy the compiled application binary from the builder stage.
COPY --from=builder /app/target/release/server .

# CRITICAL: Copy required runtime assets.
# The application loads auth templates from this directory.
COPY --from=builder /app/src/web_auth_assets ./src/web_auth_assets

# Set ownership of the application files to the non-root user.
# This is a security best practice to prevent permission issues.
RUN chown -R appuser:appgroup /app

# Switch to the unprivileged user.
USER appuser

# Expose the server port. This can be mapped to any host port at runtime.
EXPOSE 8080

# Set the entrypoint for the container to run the server.
ENTRYPOINT ["./server"]