#!/bin/bash
# Local Build and Deploy Script for Vibe Manager Website
# This script builds Next.js locally and prepares artifacts for deployment

set -e

echo "🔨 Building Next.js website locally..."
echo "======================================"

# Change to website directory
cd "$(dirname "$0")"

# Build the Next.js application locally
echo "📦 Running pnpm build..."
pnpm build

# Check if build was successful
if [ ! -d ".next/standalone" ]; then
  echo "❌ Build failed: .next/standalone directory not found"
  echo "Make sure next.config.ts has 'output: standalone' configured"
  exit 1
fi

# Prepare deployment artifacts
echo "📋 Preparing deployment artifacts..."
rm -rf deploy/standalone
rm -rf deploy/static
rm -rf deploy/public

# Copy standalone server (everything in it)
mkdir -p deploy/standalone
cp -r .next/standalone/* deploy/standalone/ 2>/dev/null || true
cp -r .next/standalone/.* deploy/standalone/ 2>/dev/null || true
# Remove unnecessary cache and duplicate folders
rm -rf deploy/standalone/cache
rm -rf deploy/standalone/standalone
# IMPORTANT: Keep .pnpm - it contains actual module code!
echo "✅ Copied standalone server (with dependencies)"

# Copy static files
cp -r .next/static deploy/static
echo "✅ Copied static files"

# Copy public files
cp -r public deploy/public
echo "✅ Copied public files"

echo ""
echo "✅ Build complete! Artifacts ready in deploy/ folder"
echo ""
echo "Next steps:"
echo "1. Run deployment to server:"
echo "   cd infrastructure/ansible"
echo "   ansible-playbook -i inventory/hosts.yml playbooks/website/deploy.yml \\"
echo "     --limit interserver-us --vault-password-file .vault_pass"
echo ""
echo "2. The deployment will:"
echo "   - Sync deploy/ folder to server"
echo "   - Build Docker image from pre-built artifacts"
echo "   - Start Traefik and Next.js containers"