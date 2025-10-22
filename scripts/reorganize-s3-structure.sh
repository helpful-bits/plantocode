#!/bin/bash

# S3 Bucket Reorganization Script
# This script reorganizes the S3 bucket structure to use versioned folders
# while maintaining backward compatibility with existing update URLs
# NOTE: This is a LEGACY MIGRATION script - bucket name kept for historical migration purposes

set -e

BUCKET="s3://vibemanager.app"
CURRENT_VERSION="1.0.17"

echo "=== S3 Bucket Reorganization Script ==="
echo "This script will reorganize your S3 bucket structure"
echo "Current version: $CURRENT_VERSION"
echo ""
echo "IMPORTANT: This maintains backward compatibility:"
echo "- latest.json stays at root (for Tauri updater)"
echo "- Files are organized in versioned folders"
echo "- Website downloads will use stable links"
echo ""

# Function to check if file exists in S3
s3_exists() {
    aws s3 ls "$1" &>/dev/null
}

# Step 1: Create new folder structure
echo "Step 1: Creating new folder structure..."
aws s3api put-object --bucket vibemanager.app --key desktop/mac/stable/ || true
aws s3api put-object --bucket vibemanager.app --key desktop/mac/archive/ || true
aws s3api put-object --bucket vibemanager.app --key desktop/windows/stable/ || true
aws s3api put-object --bucket vibemanager.app --key assets/logos/ || true
aws s3api put-object --bucket vibemanager.app --key assets/images/ || true
aws s3api put-object --bucket vibemanager.app --key assets/videos/ || true
aws s3api put-object --bucket vibemanager.app --key marketing/product-diagrams/ || true

# Step 2: Move existing desktop/mac files to versioned folders
echo ""
echo "Step 2: Moving existing desktop builds to versioned folders..."

# Process each version
for version in 1.0.12 1.0.13 1.0.14 1.0.15 1.0.16 1.0.17; do
    echo "Processing version $version..."
    
    # Create version folder
    aws s3api put-object --bucket vibemanager.app --key "desktop/mac/v$version/" || true
    
    # Move files if they exist
    if s3_exists "$BUCKET/desktop/mac/Vibe Manager_${version}_aarch64.app.tar.gz"; then
        echo "  Moving tar.gz..."
        aws s3 mv "$BUCKET/desktop/mac/Vibe Manager_${version}_aarch64.app.tar.gz" \
                  "$BUCKET/desktop/mac/v${version}/PlanToCode-${version}.tar.gz"
    fi

    if s3_exists "$BUCKET/desktop/mac/Vibe Manager_${version}_aarch64.app.tar.gz.sig"; then
        echo "  Moving signature..."
        aws s3 mv "$BUCKET/desktop/mac/Vibe Manager_${version}_aarch64.app.tar.gz.sig" \
                  "$BUCKET/desktop/mac/v${version}/PlanToCode-${version}.tar.gz.sig"
    fi

    if s3_exists "$BUCKET/desktop/mac/Vibe Manager_${version}_aarch64.dmg"; then
        echo "  Moving DMG..."
        aws s3 mv "$BUCKET/desktop/mac/Vibe Manager_${version}_aarch64.dmg" \
                  "$BUCKET/desktop/mac/v${version}/PlanToCode-${version}.dmg"
    fi
done

# Step 3: Copy current version to stable
echo ""
echo "Step 3: Copying current version ($CURRENT_VERSION) to stable folder..."
if s3_exists "$BUCKET/desktop/mac/v${CURRENT_VERSION}/"; then
    aws s3 cp "$BUCKET/desktop/mac/v${CURRENT_VERSION}/PlanToCode-${CURRENT_VERSION}.tar.gz" \
              "$BUCKET/desktop/mac/stable/latest.tar.gz"
    aws s3 cp "$BUCKET/desktop/mac/v${CURRENT_VERSION}/PlanToCode-${CURRENT_VERSION}.tar.gz.sig" \
              "$BUCKET/desktop/mac/stable/latest.tar.gz.sig"
    aws s3 cp "$BUCKET/desktop/mac/v${CURRENT_VERSION}/PlanToCode-${CURRENT_VERSION}.dmg" \
              "$BUCKET/desktop/mac/stable/latest.dmg"
fi

# Step 4: Move old versions to archive (optional - keeping only last 3 versions in main)
echo ""
echo "Step 4: Moving older versions to archive..."
for version in 1.0.12 1.0.13 1.0.14; do
    if s3_exists "$BUCKET/desktop/mac/v${version}/"; then
        echo "  Archiving version $version..."
        aws s3 mv "$BUCKET/desktop/mac/v${version}/" \
                  "$BUCKET/desktop/mac/archive/v${version}/" --recursive
    fi
done

# Step 5: Clean up root level old files
echo ""
echo "Step 5: Cleaning up old root-level files..."
OLD_FILES=(
    "Vibe Manager.app.tar.gz"
    "Vibe Manager.app.tar.gz.sig"
    "Vibe Manager_1.0.1_aarch64.dmg"
    "Vibe Manager_1.0.3_aarch64.dmg"
    "Vibe Manager_1.0.3_aarch64.dmg.sig"
    "Vibe_Manager.app.tar.gz"
    "Vibe_Manager.app.tar.gz.sig"
    "Vibe_Manager_1.0.3_aarch64-apple-darwin.app.tar.gz"
    "Vibe_Manager_1.0.3_aarch64-apple-darwin.app.tar.gz.sig"
    "Vibe_Manager_1.0.3_aarch64.dmg"
)

for file in "${OLD_FILES[@]}"; do
    if s3_exists "$BUCKET/$file"; then
        echo "  Deleting $file..."
        aws s3 rm "$BUCKET/$file"
    fi
done

# Step 6: Move assets to new structure
echo ""
echo "Step 6: Moving assets to organized folders..."

# Move logos
if s3_exists "$BUCKET/logos/"; then
    aws s3 mv "$BUCKET/logos/" "$BUCKET/assets/logos/" --recursive
fi

# Move images
if s3_exists "$BUCKET/images/"; then
    aws s3 mv "$BUCKET/images/" "$BUCKET/assets/images/" --recursive
fi

# Move videos
if s3_exists "$BUCKET/videos/"; then
    aws s3 mv "$BUCKET/videos/" "$BUCKET/assets/videos/" --recursive
fi

# Move marketing content
if s3_exists "$BUCKET/marketing-content/product-diagrams/"; then
    aws s3 mv "$BUCKET/marketing-content/product-diagrams/" \
              "$BUCKET/marketing/product-diagrams/" --recursive
    aws s3 rm "$BUCKET/marketing-content/" --recursive || true
fi

# Step 7: Update latest.json remains at root but points to versioned files
echo ""
echo "Step 7: Keeping latest.json at root (for backward compatibility)..."
# Download current latest.json to preserve it
aws s3 cp "$BUCKET/latest.json" /tmp/current-latest.json || echo "No existing latest.json found"

# For now, keep the existing latest.json as is since updater expects specific paths
echo "Note: latest.json will remain at root level pointing to current version files"
echo "      This maintains compatibility with Tauri updater"

# Step 8: List final structure
echo ""
echo "Step 8: Final structure:"
echo "========================"
echo "Desktop builds:"
aws s3 ls "$BUCKET/desktop/mac/" --recursive | grep -E "v1\.|stable" | head -20

echo ""
echo "Assets:"
aws s3 ls "$BUCKET/assets/" --recursive | head -10

echo ""
echo "=== Reorganization Complete ==="
echo ""
echo "Next steps:"
echo "1. Run: aws cloudfront create-invalidation --distribution-id E3GOJY1ZZMTZ8T --paths '/*'"
echo "2. Update BUILD.md with new paths"
echo "3. Test auto-updater with new structure"
echo ""
echo "New structure uses:"
echo "  - Versioned folders: desktop/mac/v1.0.17/"
echo "  - Stable symlinks: desktop/mac/stable/latest.*"
echo "  - Archive for old versions: desktop/mac/archive/"
echo "  - Organized assets: assets/logos/, assets/videos/, etc."