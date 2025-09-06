# Vibe Manager Website - Deployment & Configuration Guide

This guide covers deployment using LOCAL BUILD + Docker deployment:
1. **Build Next.js locally** for faster, more efficient builds
2. **Deploy pre-built artifacts** to Interserver with Docker
3. **Cloudflare CDN** with Traefik reverse proxy

---

## LOCAL BUILD + Docker Deployment Process

### Build Process Overview

**IMPORTANT**: We build Next.js LOCALLY on your development machine, not on the server. This provides:
- ✅ Faster builds (use your local machine's resources)
- ✅ No server downtime during builds
- ✅ Consistent build environment
- ✅ Ability to test builds before deployment

### Quick Deployment

```bash
# 1. Build locally (from website/ directory)
./build-and-deploy.sh

# 2. Deploy to server (from infrastructure/ansible/)
ansible-playbook -i inventory/hosts.yml playbooks/website/website-docker-deploy.yml \
  --limit interserver-us --vault-password-file .vault_pass
```

### Infrastructure Overview

- **Local Build**: Next.js built on your machine
- **Hosting**: Interserver VPS (Ubuntu 22.04 LTS)
- **Reverse Proxy**: Traefik v3.0 with automatic Let's Encrypt SSL via DNS-01
- **CDN/Security**: Cloudflare (Full/Strict SSL mode)
- **Containerization**: Docker with pre-built artifacts
- **SSL Management**: Automatic Let's Encrypt via Cloudflare DNS API

### Docker Configuration

Create the following files in your server deployment directory:

#### `docker-compose.yml`
```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v3.0
    container_name: traefik
    restart: unless-stopped
    command:
      # Enable Docker provider
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      
      # Configure entrypoints
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      
      # Enable Let's Encrypt
      - --certificatesresolvers.letsencrypt.acme.httpchallenge=true
      - --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
      - --certificatesresolvers.letsencrypt.acme.email=your-email@domain.com
      - --certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json
      
      # Global redirect HTTP to HTTPS
      - --entrypoints.web.http.redirections.entryPoint.to=websecure
      - --entrypoints.web.http.redirections.entryPoint.scheme=https
      - --entrypoints.web.http.redirections.entrypoint.permanent=true
      
      # Enable dashboard (optional, secure it properly)
      - --api.dashboard=true
      - --api.insecure=false
      
      # Logging
      - --log.level=INFO
      - --accesslog=true
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./letsencrypt:/letsencrypt
      - ./traefik-config:/etc/traefik:ro
    labels:
      - traefik.enable=true
      # Dashboard route (optional - secure with auth)
      - traefik.http.routers.dashboard.rule=Host(`traefik.yourdomain.com`)
      - traefik.http.routers.dashboard.tls.certresolver=letsencrypt
      - traefik.http.routers.dashboard.service=api@internal

  vibe-website:
    build: .
    container_name: vibe-website
    restart: unless-stopped
    environment:
      # Production environment variables
      - NODE_ENV=production
      - NEXT_PUBLIC_PLAUSIBLE_DOMAIN=vibemanager.app
      - NEXT_PUBLIC_X_PIXEL_ID=${X_PIXEL_ID}
      - NEXT_PUBLIC_X_DOWNLOAD_EVENT_ID=${X_DOWNLOAD_EVENT_ID}
      - NEXT_PUBLIC_GA_MEASUREMENT_ID=${GA_MEASUREMENT_ID}
      - GA_API_SECRET=${GA_API_SECRET}
      - NEXT_PUBLIC_MEDIA_CDN_BASE=${MEDIA_CDN_BASE}
      - GOOGLE_SITE_VERIFICATION_CODE=${GOOGLE_SITE_VERIFICATION_CODE}
    labels:
      - traefik.enable=true
      
      # Main domain routing
      - traefik.http.routers.vibe-website.rule=Host(`vibemanager.app`) || Host(`www.vibemanager.app`)
      - traefik.http.routers.vibe-website.tls.certresolver=letsencrypt
      - traefik.http.routers.vibe-website.tls.domains[0].main=vibemanager.app
      - traefik.http.routers.vibe-website.tls.domains[0].sans=www.vibemanager.app
      
      # Service configuration
      - traefik.http.services.vibe-website.loadbalancer.server.port=3000
      
      # Middleware for security headers
      - traefik.http.routers.vibe-website.middlewares=security-headers@docker
      
      # Security middleware definition
      - traefik.http.middlewares.security-headers.headers.customRequestHeaders.CF-Connecting-IP=
      - traefik.http.middlewares.security-headers.headers.customRequestHeaders.X-Forwarded-Proto=https
      - traefik.http.middlewares.security-headers.headers.customRequestHeaders.X-Real-IP=
      - traefik.http.middlewares.security-headers.headers.customResponseHeaders.X-Frame-Options=DENY
      - traefik.http.middlewares.security-headers.headers.customResponseHeaders.X-Content-Type-Options=nosniff
      - traefik.http.middlewares.security-headers.headers.customResponseHeaders.Referrer-Policy=strict-origin-when-cross-origin
      - traefik.http.middlewares.security-headers.headers.customResponseHeaders.Permissions-Policy=camera=(), microphone=(), geolocation=()

networks:
  default:
    name: web
    external: true
```

#### `Dockerfile`
```dockerfile
FROM node:18-alpine AS dependencies
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile --production

FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:18-alpine AS runner
WORKDIR /app

# Create nextjs user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

#### `.env.production` (Server Environment)
```bash
# Analytics Configuration
X_PIXEL_ID=your_pixel_id_here
X_DOWNLOAD_EVENT_ID=your_event_id_here
GA_MEASUREMENT_ID=G-SNQQT3LLEB
GA_API_SECRET=your_ga_api_secret

# CDN Configuration  
MEDIA_CDN_BASE=https://d2tyb0wucqqf48.cloudfront.net

# Verification
GOOGLE_SITE_VERIFICATION_CODE=your_verification_code

# Security
NODE_ENV=production
```

### Cloudflare Configuration

#### DNS Settings
```
Type: A
Name: vibemanager.app
Value: [YOUR_INTERSERVER_IP]
Proxy: Enabled (Orange Cloud)

Type: A
Name: www
Value: [YOUR_INTERSERVER_IP]  
Proxy: Enabled (Orange Cloud)
```

#### SSL/TLS Settings
- **Encryption Mode**: Full
- **Always Use HTTPS**: On
- **HTTP Strict Transport Security (HSTS)**: Enable after initial setup
- **Minimum TLS Version**: 1.2

#### Page Rules
```
Cache Level: Bypass
Pattern: api/*

Cache Level: Cache Everything
Edge TTL: 1 year
Pattern: _next/static/*

Cache Level: Cache Everything  
Edge TTL: 30 days
Pattern: images/*
```

#### Security Settings
- **Security Level**: Medium
- **Challenge Passage**: 30 minutes
- **Browser Integrity Check**: On
- **Rate Limiting**: Configure for API endpoints

### Deployment Steps

1. **Server Preparation**
   ```bash
   # Create deployment directory
   sudo mkdir -p /opt/vibe-manager
   cd /opt/vibe-manager
   
   # Create Docker network
   sudo docker network create web
   
   # Create required directories
   sudo mkdir -p letsencrypt traefik-config
   sudo chmod 600 letsencrypt
   ```

2. **Deploy Application**
   ```bash
   # Clone repository
   git clone https://github.com/your-org/vibe-manager.git .
   
   # Copy production files
   cp docker-compose.yml .env.production ./
   
   # Build and start services
   sudo docker-compose up -d --build
   ```

3. **Verify Deployment**
   ```bash
   # Check container status
   sudo docker-compose ps
   
   # View logs
   sudo docker-compose logs -f vibe-website
   sudo docker-compose logs -f traefik
   
   # Test endpoints
   curl -I https://vibemanager.app/api/health
   curl -I https://www.vibemanager.app/
   ```

4. **SSL Certificate Verification**
   ```bash
   # Check certificate status
   openssl s_client -connect vibemanager.app:443 -servername vibemanager.app
   
   # Verify auto-renewal
   sudo docker exec traefik ls -la /letsencrypt/
   ```

### Monitoring and Maintenance

#### Health Checks
- **Application**: `https://vibemanager.app/api/health`
- **Traefik Dashboard**: `https://traefik.yourdomain.com` (if enabled)
- **SSL Certificate Expiry**: Automatic monitoring via Let's Encrypt

#### Log Management
```bash
# Application logs
sudo docker-compose logs vibe-website

# Traefik logs (access and errors)
sudo docker-compose logs traefik

# Certificate renewal logs
sudo docker exec traefik cat /var/log/traefik/traefik.log
```

#### Backup Strategy
- **Code**: Git repository backups
- **Certificates**: `/opt/vibe-manager/letsencrypt/` directory
- **Configuration**: Docker Compose files and environment variables
- **Container Data**: Regular snapshots of container volumes

#### Updates and Maintenance
```bash
# Update application
cd /opt/vibe-manager
git pull origin main
sudo docker-compose up -d --build vibe-website

# Update Traefik
sudo docker-compose pull traefik
sudo docker-compose up -d traefik

# Certificate renewal (automatic, but manual check)
sudo docker exec traefik traefik healthcheck
```

### Troubleshooting

#### Common Issues

1. **Certificate Generation Fails**
   ```bash
   # Check Traefik logs
   sudo docker-compose logs traefik
   
   # Verify DNS propagation
   dig @1.1.1.1 vibemanager.app
   
   # Manual certificate request
   sudo docker exec traefik acme.sh --issue --dns dns_cf -d vibemanager.app
   ```

2. **503 Service Unavailable**
   ```bash
   # Check application health
   sudo docker-compose ps
   sudo docker-compose logs vibe-website
   
   # Restart application
   sudo docker-compose restart vibe-website
   ```

3. **Cloudflare Connection Issues**
   - Verify IP address is correct in DNS
   - Check Cloudflare SSL mode (should be "Full")
   - Ensure origin server is accepting HTTPS connections

4. **Analytics Not Working**
   ```bash
   # Check environment variables
   sudo docker exec vibe-website env | grep -E "(X_PIXEL|GA_|PLAUSIBLE)"
   
   # Test API endpoints
   curl -X POST https://vibemanager.app/api/analytics/track \
     -H "Content-Type: application/json" \
     -d '{"event": "test"}'
   ```

---

## Legacy Vercel Environment Variables

Add these environment variables in your Vercel project settings (Settings → Environment Variables):

### Required Variables

#### Analytics Configuration
```bash
# Plausible Analytics (Optional - defaults to 'vibemanager.app')
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=vibemanager.app

# X (Twitter) Pixel - Server-side Implementation
NEXT_PUBLIC_X_PIXEL_ID=your_pixel_id_here  # Get from X Ads Manager
NEXT_PUBLIC_X_DOWNLOAD_EVENT_ID=your_event_id  # Get from X Events Manager

# Google Site Verification (Optional - for Search Console)
GOOGLE_SITE_VERIFICATION_CODE=your_verification_code

# Google Analytics
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-SNQQT3LLEB  # Your Google Analytics 4 Measurement ID
```

#### CDN Configuration
```bash
# Media CDN Base URL (Optional - defaults to CloudFront)
NEXT_PUBLIC_MEDIA_CDN_BASE=https://d2tyb0wucqqf48.cloudfront.net
```

### Setting Up in Vercel

1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add each variable with the appropriate value
4. Select which environments to apply to (Production/Preview/Development)
5. Save and redeploy for changes to take effect

### Getting Your X Pixel ID

1. Log in to X Ads Manager (ads.twitter.com)
2. Go to Tools → Events Manager
3. Create or select your Pixel
4. Copy the Pixel ID (format: `qd2ik` or similar)
5. Also note your Event IDs for conversions (e.g., `qd2io` for downloads)

## Fixed: Hydration Mismatch Error

### The Problem
The website was experiencing a persistent hydration error that occurred "ALL the time". The error was caused by the `MonacoCodeViewerInner` component checking DOM state during initialization to detect dark mode.

### What Was Happening
1. **Server-Side Rendering (SSR)**: During SSR, `window` and `document` are undefined, so the component initialized `isDarkMode` to `false`
2. **Client-Side Hydration**: During hydration, the component would check the actual DOM and might find dark mode is `true`
3. **Mismatch**: React detected that the server HTML didn't match the client state, causing a hydration error

### The Fix Applied
```typescript
// BEFORE (Caused hydration errors):
const [isDarkMode, setIsDarkMode] = useState(() => {
  if (typeof window === 'undefined') return false;
  const htmlElement = document.documentElement;
  const bodyElement = document.body;
  return htmlElement.classList.contains('dark') || 
         bodyElement.classList.contains('dark');
});

// AFTER (Hydration-safe):
const [isDarkMode, setIsDarkMode] = useState(false);
// Dark mode is now properly detected in useEffect after mount
```

### Why This Fix Works
1. **Consistent Initial State**: Both server and client start with `isDarkMode = false`
2. **Post-Mount Detection**: The actual dark mode is detected in `useEffect` which only runs on the client after hydration
3. **No Mismatch**: The initial render is identical on both server and client

### Additional Improvements Made
- Removed `console.log` statements that were polluting production logs
- Added clear comments explaining the hydration safety approach
- The `MonacoCodeViewer` wrapper already uses `ssr: false` for the Monaco editor itself

## Monitoring & Verification

### Verify Analytics Are Working

1. **Plausible Analytics**:
   - Open browser DevTools → Network tab
   - Look for requests to `plausible.io/api/event`
   - Check that events fire on download button clicks

2. **X Pixel**:
   - Install X Pixel Helper browser extension
   - Verify base pixel loads on page load
   - Confirm conversion events fire on download clicks
   - Check for proper event parameters

3. **Check for Hydration Errors**:
   - Open browser console
   - Look for React hydration warnings
   - Test theme switching (light/dark mode)
   - Verify Monaco editor loads without errors

### Build Verification
```bash
# Build locally to test
pnpm build

# Check for TypeScript errors
pnpm typecheck

# Test production build locally
pnpm start
```

## Common Issues & Solutions

### Issue: X Pixel Not Firing
- **Solution**: Ensure `NEXT_PUBLIC_X_PIXEL_ID` and `NEXT_PUBLIC_X_DOWNLOAD_EVENT_ID` are set in Vercel
- Check browser ad blockers aren't blocking `ads-twitter.com`

### Issue: Plausible Events Not Showing
- **Solution**: Verify goal names in Plausible dashboard match exactly:
  - "Download Click"
  - "CTA Click" 
  - "Signup Start"
  - "Section View"

### Issue: Dark Mode Flashing
- **Solution**: This is expected behavior - the theme loads after mount to prevent hydration errors. The brief flash is preferable to breaking the entire interactive demo.

## Support

For deployment issues, check:
1. Vercel build logs for compilation errors
2. Browser console for runtime errors
3. Network tab for failed resource loads
4. React DevTools for component errors

Last Updated: 2024