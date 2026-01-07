#!/bin/bash
# Boot sync script for plantocode
# Ensures nginx upstream matches the active deployment after reboot

set -e

ACTIVE_COLOR_FILE="/opt/plantocode/config/active-color"
NGINX_UPSTREAM_CONF="/etc/nginx/conf.d/plantocode-upstream.conf"
BLUE_PORT=8080
GREEN_PORT=8081

log() {
    echo "[plantocode-boot-sync] $1"
    logger -t plantocode-boot-sync "$1"
}

# Determine which color should be active
get_target_color() {
    # First, check persistent state file
    if [ -f "$ACTIVE_COLOR_FILE" ]; then
        cat "$ACTIVE_COLOR_FILE"
        return
    fi

    # Fallback: check which service is enabled
    if systemctl is-enabled --quiet plantocode-blue 2>/dev/null; then
        echo "blue"
    elif systemctl is-enabled --quiet plantocode-green 2>/dev/null; then
        echo "green"
    else
        # Default to blue
        echo "blue"
    fi
}

# Update nginx upstream to point to correct port
update_nginx_upstream() {
    local color=$1
    local port

    if [ "$color" = "blue" ]; then
        port=$BLUE_PORT
    else
        port=$GREEN_PORT
    fi

    cat > "$NGINX_UPSTREAM_CONF" <<EOF
upstream plantocode_backend {
    server 127.0.0.1:${port};
    keepalive 32;
    keepalive_requests 100;
    keepalive_timeout 60s;
}
EOF

    log "Updated nginx upstream to port $port ($color)"
}

# Main
log "Starting boot sync..."

TARGET_COLOR=$(get_target_color)
log "Target color: $TARGET_COLOR"

# Update nginx upstream
update_nginx_upstream "$TARGET_COLOR"

# Ensure correct service is enabled and started
if [ "$TARGET_COLOR" = "blue" ]; then
    systemctl enable plantocode-blue 2>/dev/null || true
    systemctl disable plantocode-green 2>/dev/null || true
else
    systemctl enable plantocode-green 2>/dev/null || true
    systemctl disable plantocode-blue 2>/dev/null || true
fi

# Save state if it wasn't already saved
echo "$TARGET_COLOR" > "$ACTIVE_COLOR_FILE"

log "Boot sync complete. Active: $TARGET_COLOR"
