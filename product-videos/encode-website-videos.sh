#!/bin/bash

# Website Video Encoding Script for Vibe Manager
# These videos will be uploaded to CloudFront at: https://d2tyb0wucqqf48.cloudfront.net/videos/
# DO NOT RUN THIS SCRIPT DIRECTLY - Review videos first!

echo "========================================="
echo "WEBSITE VIDEO ENCODING COMMANDS"
echo "========================================="
echo ""
echo "This script contains commands to encode website demo videos in both MP4 and VP9 formats."
echo "Review each video before encoding!"
echo ""

# Navigate to the Remotion project directory
cd /Users/kirylkazlovich/dev/vibe-manager/product-videos/remotion-project

# Create exports directory if it doesn't exist
mkdir -p ../exports/website

echo "1. RENDERING VIDEOS FROM REMOTION"
echo "=================================="
echo ""

# Step 1: Task Input & Refinement (30 seconds)
echo "# Step 1: Task Input & Refinement"
echo "npx remotion render WebStep1 ../exports/website/step-1-describe-raw.mp4"
echo ""

# Step 2: File Finder (30 seconds)
echo "# Step 2: File Finder Workflow"
echo "npx remotion render WebStep2 ../exports/website/step-2-find-raw.mp4"
echo ""

# Step 3: Deep Research (25 seconds)
echo "# Step 3: Deep Research Workflow"
echo "npx remotion render WebStep3 ../exports/website/step-3-generate-raw.mp4"
echo ""

# Step 4: Council of LLMs (30 seconds)
echo "# Step 4: Council of LLMs / Plan Merging"
echo "npx remotion render WebStep4 ../exports/website/step-4-merge-raw.mp4"
echo ""

echo "2. MP4 ENCODING (H.264/AAC - Universal Compatibility)"
echo "======================================================"
echo ""

# MP4 encoding with H.264 for maximum compatibility
echo "# Encode Step 1 to MP4"
echo "ffmpeg -i ../exports/website/step-1-describe-raw.mp4 \\
  -c:v libx264 \\
  -preset slow \\
  -crf 23 \\
  -pix_fmt yuv420p \\
  -movflags +faststart \\
  -an \\
  ../exports/website/step-1-describe.mp4"
echo ""

echo "# Encode Step 2 to MP4"
echo "ffmpeg -i ../exports/website/step-2-find-raw.mp4 \\
  -c:v libx264 \\
  -preset slow \\
  -crf 23 \\
  -pix_fmt yuv420p \\
  -movflags +faststart \\
  -an \\
  ../exports/website/step-2-find.mp4"
echo ""

echo "# Encode Step 3 to MP4"
echo "ffmpeg -i ../exports/website/step-3-generate-raw.mp4 \\
  -c:v libx264 \\
  -preset slow \\
  -crf 23 \\
  -pix_fmt yuv420p \\
  -movflags +faststart \\
  -an \\
  ../exports/website/step-3-generate.mp4"
echo ""

echo "# Encode Step 4 to MP4"
echo "ffmpeg -i ../exports/website/step-4-merge-raw.mp4 \\
  -c:v libx264 \\
  -preset slow \\
  -crf 23 \\
  -pix_fmt yuv420p \\
  -movflags +faststart \\
  -an \\
  ../exports/website/step-4-merge.mp4"
echo ""

echo "3. VP9/WEBM ENCODING (Better Compression, Modern Browsers)"
echo "==========================================================="
echo ""

# VP9 encoding for better compression and quality
echo "# Encode Step 1 to VP9/WebM"
echo "ffmpeg -i ../exports/website/step-1-describe-raw.mp4 \\
  -c:v libvpx-vp9 \\
  -crf 31 \\
  -b:v 0 \\
  -cpu-used 2 \\
  -row-mt 1 \\
  -auto-alt-ref 1 \\
  -lag-in-frames 25 \\
  -an \\
  ../exports/website/step-1-describe.webm"
echo ""

echo "# Encode Step 2 to VP9/WebM"
echo "ffmpeg -i ../exports/website/step-2-find-raw.mp4 \\
  -c:v libvpx-vp9 \\
  -crf 31 \\
  -b:v 0 \\
  -cpu-used 2 \\
  -row-mt 1 \\
  -auto-alt-ref 1 \\
  -lag-in-frames 25 \\
  -an \\
  ../exports/website/step-2-find.webm"
echo ""

echo "# Encode Step 3 to VP9/WebM"
echo "ffmpeg -i ../exports/website/step-3-generate-raw.mp4 \\
  -c:v libvpx-vp9 \\
  -crf 31 \\
  -b:v 0 \\
  -cpu-used 2 \\
  -row-mt 1 \\
  -auto-alt-ref 1 \\
  -lag-in-frames 25 \\
  -an \\
  ../exports/website/step-3-generate.webm"
echo ""

echo "# Encode Step 4 to VP9/WebM"
echo "ffmpeg -i ../exports/website/step-4-merge-raw.mp4 \\
  -c:v libvpx-vp9 \\
  -crf 31 \\
  -b:v 0 \\
  -cpu-used 2 \\
  -row-mt 1 \\
  -auto-alt-ref 1 \\
  -lag-in-frames 25 \\
  -an \\
  ../exports/website/step-4-merge.webm"
echo ""

echo "4. GENERATE POSTER IMAGES"
echo "========================="
echo ""

# Generate poster images from first frame of each video
echo "# Generate poster for Step 1"
echo "ffmpeg -i ../exports/website/step-1-describe.mp4 -vf \"scale=1920:1080\" -frames:v 1 ../exports/website/step-1-poster.jpg"
echo ""

echo "# Generate poster for Step 2"
echo "ffmpeg -i ../exports/website/step-2-find.mp4 -vf \"scale=1920:1080\" -frames:v 1 ../exports/website/step-2-poster.jpg"
echo ""

echo "# Generate poster for Step 3"
echo "ffmpeg -i ../exports/website/step-3-generate.mp4 -vf \"scale=1920:1080\" -frames:v 1 ../exports/website/step-3-poster.jpg"
echo ""

echo "# Generate poster for Step 4"
echo "ffmpeg -i ../exports/website/step-4-merge.mp4 -vf \"scale=1920:1080\" -frames:v 1 ../exports/website/step-4-poster.jpg"
echo ""

echo "5. S3 UPLOAD COMMANDS (DO NOT RUN WITHOUT PERMISSION)"
echo "======================================================"
echo ""

echo "# Upload MP4 videos"
echo "aws s3 cp ../exports/website/step-1-describe.mp4 s3://your-bucket/videos/step-1-describe.mp4 --cache-control \"max-age=31536000\" --content-type \"video/mp4\""
echo "aws s3 cp ../exports/website/step-2-find.mp4 s3://your-bucket/videos/step-2-find.mp4 --cache-control \"max-age=31536000\" --content-type \"video/mp4\""
echo "aws s3 cp ../exports/website/step-3-generate.mp4 s3://your-bucket/videos/step-3-generate.mp4 --cache-control \"max-age=31536000\" --content-type \"video/mp4\""
echo "aws s3 cp ../exports/website/step-4-merge.mp4 s3://your-bucket/videos/step-4-merge.mp4 --cache-control \"max-age=31536000\" --content-type \"video/mp4\""
echo ""

echo "# Upload WebM videos"
echo "aws s3 cp ../exports/website/step-1-describe.webm s3://your-bucket/videos/step-1-describe.webm --cache-control \"max-age=31536000\" --content-type \"video/webm\""
echo "aws s3 cp ../exports/website/step-2-find.webm s3://your-bucket/videos/step-2-find.webm --cache-control \"max-age=31536000\" --content-type \"video/webm\""
echo "aws s3 cp ../exports/website/step-3-generate.webm s3://your-bucket/videos/step-3-generate.webm --cache-control \"max-age=31536000\" --content-type \"video/webm\""
echo "aws s3 cp ../exports/website/step-4-merge.webm s3://your-bucket/videos/step-4-merge.webm --cache-control \"max-age=31536000\" --content-type \"video/webm\""
echo ""

echo "# Upload poster images"
echo "aws s3 cp ../exports/website/step-1-poster.jpg s3://your-bucket/images/step-1-poster.jpg --cache-control \"max-age=31536000\" --content-type \"image/jpeg\""
echo "aws s3 cp ../exports/website/step-2-poster.jpg s3://your-bucket/images/step-2-poster.jpg --cache-control \"max-age=31536000\" --content-type \"image/jpeg\""
echo "aws s3 cp ../exports/website/step-3-poster.jpg s3://your-bucket/images/step-3-poster.jpg --cache-control \"max-age=31536000\" --content-type \"image/jpeg\""
echo "aws s3 cp ../exports/website/step-4-poster.jpg s3://your-bucket/images/step-4-poster.jpg --cache-control \"max-age=31536000\" --content-type \"image/jpeg\""
echo ""

echo "6. CLOUDFRONT INVALIDATION (AFTER UPLOAD)"
echo "=========================================="
echo ""
echo "aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths \"/videos/*\" \"/images/*\""
echo ""

echo "========================================="
echo "SUMMARY OF VIDEO SPECS"
echo "========================================="
echo ""
echo "WebStep1: 30 seconds - Task Input & Refinement (Voice, Screen, Inline editing)"
echo "WebStep2: 30 seconds - File Finder Workflow (Decomposition, Search, Assessment, Dependencies)"
echo "WebStep3: 25 seconds - Deep Research (Knowledge gaps, Documentation search, Synthesis)"
echo "WebStep4: 30 seconds - Council of LLMs (Multi-model generation, Deep synthesis, Review)"
echo ""
echo "Total runtime: ~115 seconds of demo content"
echo ""
echo "MP4: H.264 codec, CRF 23, yuv420p for universal compatibility"
echo "VP9: WebM container, CRF 31, better compression for modern browsers"
echo ""
echo "CloudFront Base URL: https://d2tyb0wucqqf48.cloudfront.net/"
echo ""