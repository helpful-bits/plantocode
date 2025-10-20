# Zero-Downtime Deployment System

This system enables true zero-downtime deployments for PlanToCode with support for long-running streaming connections.

## Key Features

✅ **Preserves Long-Running Streams**: Streams can run for hours without interruption
✅ **No Connection Drops**: Existing connections continue on old instance until completion
✅ **Gradual Traffic Migration**: New connections route to new instance while old completes
✅ **Authenticated Monitoring**: Deployment status endpoint protected by API token
✅ **Configurable Drain Timeout**: Can wait indefinitely for long streams

## How It Works

### Deployment Flow

1. **New instance starts** on alternate port (8080/8081)
2. **Health check** validates new instance
3. **Nginx weighted routing** (100:1 ratio) sends 99% new traffic to new instance
4. **Complete removal** of old instance from upstream (existing connections preserved via keepalive)
5. **Drain wait** for old instance (configurable timeout, can be indefinite)
6. **Old instance stops** only after all connections complete

### Critical Design Decisions

#### Nginx Upstream Strategy
- **Step 4**: Uses weight ratio (100:1) instead of "backup" directive
  - New server: weight=100 (gets 99% of new connections)
  - Old server: weight=1 (gets 1% of new connections, handles existing)
- **Step 5**: Removes old server from upstream completely
  - Existing connections continue due to nginx keepalive
  - No new connections can reach old server

#### SIGTERM Handling
- Server **DOES NOT** cancel streams on SIGTERM (blue/green deployments)
- Only cancels on SIGINT (manual shutdown)
- Allows streams to complete naturally during deployments

## Usage

### Basic Deployment
```bash
vibe-zero-downtime deploy /path/to/binary
```

### For Long-Running Streams (15+ minutes)
```bash
# Wait indefinitely for streams to complete
DRAIN_TIMEOUT=0 vibe-zero-downtime deploy /path/to/binary

# Or set specific timeout in seconds (e.g., 1 hour)
DRAIN_TIMEOUT=3600 vibe-zero-downtime deploy /path/to/binary
```

### Check Deployment Status
```bash
vibe-zero-downtime status
```

### Emergency Rollback
```bash
vibe-zero-downtime rollback
```

## Configuration

### Environment Variables
- `DRAIN_TIMEOUT`: Seconds to wait for drain (default: 120, use 0 for indefinite)
- `VIBE_DEPLOYMENT_TOKEN`: API token for deployment endpoint

### Files
- `/etc/nginx/conf.d/vibe-upstream.conf`: Nginx upstream configuration
- `/opt/vibe-manager/config/deployment.env`: Deployment token
- `/var/run/vibe-manager-deployment.status`: Current deployment color

## Monitoring During Deployment

The script provides real-time feedback:
```
[INFO] Waiting [2m 15s]... Connections: 3, Requests: 2, Streams: 1
```

### Health Endpoints

#### Public Health Check
```bash
curl http://localhost:8080/health
# Returns: {"status": "ok", "version": "0.2.17"}
```

#### Authenticated Deployment Status
```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/health/deployment
# Returns:
# {
#   "status": "ok",
#   "version": "0.2.17",
#   "activeStreams": 1,
#   "activeRequests": 2,
#   "deploymentColor": "blue",
#   "port": 8080,
#   "uptimeSeconds": 120,
#   "readyForShutdown": false
# }
```

## Testing Long-Running Streams

### Start a Long Stream
```bash
# Terminal 1: Start a 20-minute SSE stream
curl -N "http://api.plantocode.com/stream/test?duration=1200"
```

### Deploy While Streaming
```bash
# Terminal 2: Deploy with indefinite wait
DRAIN_TIMEOUT=0 vibe-zero-downtime deploy /path/to/new/binary
```

### Observe Behavior
- New connections go to new instance immediately
- Existing stream continues on old instance
- Script waits showing: `[INFO] Waiting [15m 30s]... Streams: 1`
- After stream completes, old instance stops

## Important Notes

1. **Default timeout is 2 minutes** - Override for longer streams
2. **Existing connections are preserved** via nginx keepalive, not "backup" directive
3. **99% of new traffic** goes to new instance during migration
4. **No SIGTERM cancellation** - streams complete naturally
5. **Deployment token required** for monitoring endpoints

## Troubleshooting

### Script waits forever
- Check if there are actually active streams: `curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/health/deployment`
- May be stuck TCP connections: `ss -tn state established "( sport = :8080 )"`

### Nginx returns 502
- New instance may have failed health check
- Check logs: `systemctl status vibe-manager-blue vibe-manager-green`

### Deployment endpoint returns "Service Unavailable"
- Token not configured in environment
- Check: `systemctl show vibe-manager-blue -p Environment | grep VIBE_DEPLOYMENT_TOKEN`

## Architecture Benefits

✅ **True Zero-Downtime**: No connection drops, even for hours-long streams
✅ **Progressive Migration**: Gradual shift minimizes risk
✅ **Observable**: Real-time metrics during deployment
✅ **Secure**: Sensitive metrics protected by authentication
✅ **Flexible**: Configurable timeouts for different use cases