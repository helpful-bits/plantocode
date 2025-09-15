#!/bin/bash
# Zero-downtime deployment script for vibe-manager
# Uses blue-green deployment strategy with graceful shutdown

set -e

# Configuration
NGINX_UPSTREAM_CONF="/etc/nginx/conf.d/vibe-upstream.conf"
DEPLOY_STATUS_FILE="/var/run/vibe-manager-deployment.status"
HEALTH_CHECK_URL="http://127.0.0.1"
HEALTH_CHECK_RETRIES=30
HEALTH_CHECK_DELAY=2
# Default drain timeout in seconds. Set to 0 for indefinite wait.
# For long-running streams (e.g., 15+ minutes), use 0 or a very high value
# Can be overridden: DRAIN_TIMEOUT=0 vibe-zero-downtime deploy /path/to/binary
DRAIN_TIMEOUT=${DRAIN_TIMEOUT:-120}

# Deployment API token for authenticated endpoints
# Must be provided via environment variable or config file
DEPLOYMENT_API_TOKEN="${VIBE_DEPLOYMENT_TOKEN:-}"

# Check if token is provided
if [ -z "$DEPLOYMENT_API_TOKEN" ]; then
    # Try to read from a secure config file
    if [ -f "/opt/vibe-manager/config/deployment.env" ]; then
        source /opt/vibe-manager/config/deployment.env
        DEPLOYMENT_API_TOKEN="${VIBE_DEPLOYMENT_TOKEN:-}"
    fi
fi

if [ -z "$DEPLOYMENT_API_TOKEN" ]; then
    log_error "VIBE_DEPLOYMENT_TOKEN not set. Please set it in environment or /opt/vibe-manager/config/deployment.env"
    exit 1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Determine current active color
get_active_color() {
    if systemctl is-active --quiet vibe-manager-blue; then
        echo "blue"
    elif systemctl is-active --quiet vibe-manager-green; then
        echo "green"
    else
        echo "none"
    fi
}

# Health check function
check_health() {
    local port=$1
    local retries=$2

    for i in $(seq 1 $retries); do
        if curl -f -s "${HEALTH_CHECK_URL}:${port}/health" > /dev/null 2>&1; then
            local response=$(curl -s "${HEALTH_CHECK_URL}:${port}/health")
            local status=$(echo "$response" | jq -r '.status' 2>/dev/null || echo "unknown")

            if [ "$status" = "ok" ]; then
                log_info "Health check passed for port $port"
                return 0
            fi
        fi

        log_warn "Health check attempt $i/$retries failed for port $port"
        sleep $HEALTH_CHECK_DELAY
    done

    return 1
}

# Wait for connections to drain
wait_for_drain() {
    local port=$1
    local timeout=$2
    local start_time=$(date +%s)

    if [ "$timeout" -eq 0 ]; then
        log_info "Waiting for connections to drain on port $port (no timeout - wait indefinitely)..."
    else
        log_info "Waiting for connections to drain on port $port (timeout: ${timeout}s)..."
    fi

    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        # Only enforce timeout if timeout > 0 (0 means wait indefinitely)
        if [ "$timeout" -gt 0 ] && [ $elapsed -gt $timeout ]; then
            log_warn "Drain timeout reached after ${elapsed}s"
            break
        fi

        # Prefer deployment endpoint for drain status (with authentication)
        local deployment_response=$(curl -s -H "Authorization: Bearer ${DEPLOYMENT_API_TOKEN}" \
            "${HEALTH_CHECK_URL}:${port}/health/deployment" 2>/dev/null || echo "{}")
        local ready_for_shutdown=$(echo "$deployment_response" | jq -r '.readyForShutdown // .ready_for_shutdown // empty' 2>/dev/null)

        if [ "$ready_for_shutdown" = "true" ]; then
            log_info "Instance on port $port reports ready_for_shutdown=true after ${elapsed}s"
            break
        fi

        # Fallback to connection checks (health endpoint no longer exposes metrics)
        local active_connections=$(ss -tn state established "( sport = :${port} )" | wc -l)

        # Try to get metrics from authenticated deployment endpoint
        local active_requests=$(echo "$deployment_response" | jq -r '.activeRequests // 0' 2>/dev/null)
        local active_streams=$(echo "$deployment_response" | jq -r '.activeStreams // 0' 2>/dev/null)

        if [ "$active_connections" -le 1 ] && [ "$active_requests" = "0" ] && [ "$active_streams" = "0" ]; then
            log_info "All connections drained successfully (${elapsed}s)"
            break
        fi

        # Show elapsed time in human-readable format
        local elapsed_min=$((elapsed / 60))
        local elapsed_sec=$((elapsed % 60))
        log_info "Waiting [${elapsed_min}m ${elapsed_sec}s]... Connections: $active_connections, Requests: $active_requests, Streams: $active_streams"
        sleep 2
    done
}

# Update nginx upstream configuration
update_nginx_upstream() {
    local active_color=$1
    local preferred_color=$2

    cat > "$NGINX_UPSTREAM_CONF" <<EOF
upstream vibe_backend {
EOF

    if [ "$active_color" = "both" ]; then
        # Migration phase: heavily favor new server but keep old server active for existing connections
        # Using weight ratio 100:1 to send 99% of new connections to new server
        # Old server remains active to handle its existing long-running connections
        if [ "$preferred_color" = "blue" ]; then
            echo "    server 127.0.0.1:8080 weight=100;" >> "$NGINX_UPSTREAM_CONF"
            echo "    server 127.0.0.1:8081 weight=1;" >> "$NGINX_UPSTREAM_CONF"
        else
            echo "    server 127.0.0.1:8081 weight=100;" >> "$NGINX_UPSTREAM_CONF"
            echo "    server 127.0.0.1:8080 weight=1;" >> "$NGINX_UPSTREAM_CONF"
        fi
    elif [ "$active_color" = "blue" ]; then
        echo "    server 127.0.0.1:8080;" >> "$NGINX_UPSTREAM_CONF"
    elif [ "$active_color" = "green" ]; then
        echo "    server 127.0.0.1:8081;" >> "$NGINX_UPSTREAM_CONF"
    fi

    cat >> "$NGINX_UPSTREAM_CONF" <<EOF
    keepalive 32;
    keepalive_requests 100;
    keepalive_timeout 60s;
}
EOF

    # Test nginx configuration
    if nginx -t > /dev/null 2>&1; then
        nginx -s reload
        log_info "Nginx configuration updated and reloaded"
        return 0
    else
        log_error "Nginx configuration test failed"
        return 1
    fi
}

# Main deployment function
deploy() {
    local new_binary=$1

    if [ ! -f "$new_binary" ]; then
        log_error "Binary not found: $new_binary"
        exit 1
    fi

    # Determine deployment strategy
    local current_color=$(get_active_color)
    local new_color
    local new_port
    local old_port

    if [ "$current_color" = "blue" ]; then
        new_color="green"
        new_port=8081
        old_port=8080
    else
        new_color="blue"
        new_port=8080
        old_port=8081
    fi

    log_info "Current deployment: $current_color"
    log_info "New deployment will be: $new_color"

    # Step 1: Deploy new binary
    log_info "Deploying new binary..."
    cp "$new_binary" /opt/vibe-manager/bin/server.new
    chown vibe-manager:vibe-manager /opt/vibe-manager/bin/server.new
    chmod +x /opt/vibe-manager/bin/server.new

    # Atomic replace
    mv /opt/vibe-manager/bin/server.new /opt/vibe-manager/bin/server

    # Step 2: Start new instance
    log_info "Starting $new_color instance on port $new_port..."
    systemctl start vibe-manager-$new_color

    # Step 3: Health check new instance
    log_info "Performing health check on new instance..."
    if ! check_health $new_port $HEALTH_CHECK_RETRIES; then
        log_error "Health check failed for new instance"
        systemctl stop vibe-manager-$new_color
        exit 1
    fi

    # Step 4: Start gradual traffic migration
    log_info "Starting gradual traffic migration (99% to new, 1% to old)..."
    update_nginx_upstream "both" "$new_color"

    # Wait for some connections to establish on new instance
    sleep 10

    # Step 5: Remove old instance from load balancing completely
    # Existing connections will continue due to nginx keepalive
    log_info "Removing old instance from load balancing (existing connections preserved)..."
    update_nginx_upstream "$new_color" "$new_color"

    # Step 6: Wait for old instance to drain naturally (no SIGTERM)
    if [ "$current_color" != "none" ]; then
        log_info "Waiting for $current_color instance to drain naturally..."
        log_info "Note: Existing connections will continue until they complete or disconnect"

        # Wait for connections to drain WITHOUT sending SIGTERM first
        # This allows long-running streams to complete naturally
        # Use DRAIN_TIMEOUT=0 for indefinite wait (e.g., for hours-long streams)
        wait_for_drain $old_port $DRAIN_TIMEOUT

        # After drain is complete (or timeout), stop the service
        log_info "Stopping $current_color instance after drain..."
        systemctl stop vibe-manager-$current_color
        log_info "$current_color instance stopped"
    fi

    # Step 7: Update deployment status
    echo "$new_color" > "$DEPLOY_STATUS_FILE"

    log_info "Deployment completed successfully! Active: $new_color"
}

# Rollback function
rollback() {
    local current_color=$(get_active_color)
    local previous_color

    if [ "$current_color" = "blue" ]; then
        previous_color="green"
    else
        previous_color="blue"
    fi

    log_warn "Rolling back to $previous_color..."

    # Start previous instance
    systemctl start vibe-manager-$previous_color

    # Update nginx
    update_nginx_upstream "$previous_color" "$previous_color"

    # Stop current instance
    systemctl stop vibe-manager-$current_color

    echo "$previous_color" > "$DEPLOY_STATUS_FILE"
    log_info "Rollback completed"
}

# Usage
case "${1:-}" in
    deploy)
        if [ -z "${2:-}" ]; then
            log_error "Usage: $0 deploy <path-to-binary>"
            exit 1
        fi
        deploy "$2"
        ;;
    rollback)
        rollback
        ;;
    status)
        current=$(get_active_color)
        echo "Active deployment: $current"

        if systemctl is-active --quiet vibe-manager-blue; then
            echo "Blue: running (port 8080)"
        else
            echo "Blue: stopped"
        fi

        if systemctl is-active --quiet vibe-manager-green; then
            echo "Green: running (port 8081)"
        else
            echo "Green: stopped"
        fi
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|status}"
        echo "  deploy <binary>  - Deploy new version with zero downtime"
        echo "  rollback        - Rollback to previous version"
        echo "  status          - Show deployment status"
        exit 1
        ;;
esac