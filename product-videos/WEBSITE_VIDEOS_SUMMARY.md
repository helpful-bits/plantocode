# Website Video Summary

## Video Locations on Website

The website's **HowItWorks** section (`website/src/app/page.tsx`) displays 4 demo videos served via CloudFront CDN:

### CloudFront Configuration
- **Base URL**: `https://d2tyb0wucqqf48.cloudfront.net/`
- **CDN Helper**: `website/src/lib/cdn.ts`
- **Component**: `website/src/components/landing/HowItWorks.tsx`

## Created Video Compositions

### 1. WebStep1: Task Input & Refinement (30 seconds)
**File**: `src/compositions/WebStep1.tsx`
- **Beat 1** (10s): Voice transcription - "Just talk. AI transcribes your ideas perfectly."
- **Beat 2** (10s): Screen recording - "Can't explain? Record your screen. AI analyzes everything."  
- **Beat 3** (10s): Inline editing - "Select, merge, and refine tasks inline."
- **Output**: `step-1-describe.mp4` and `step-1-describe.webm`

### 2. WebStep2: File Finder Workflow (30 seconds)
**File**: `src/compositions/WebStep2.tsx`
- **Beat 1** (7.5s): Task decomposition - "AI decomposes your task into logical areas."
- **Beat 2** (7.5s): Search patterns - "Creates targeted search patterns for your codebase."
- **Beat 3** (7.5s): AI assessment - "AI assesses actual file content for relevance."
- **Beat 4** (7.5s): Dependencies - "Expands to find critical dependencies when needed."
- **Output**: `step-2-find.mp4` and `step-2-find.webm`

### 3. WebStep3: Deep Research Workflow (25 seconds)
**File**: `src/compositions/WebStep3.tsx`
- **Beat 1** (6.25s): Problem identification - "Identifies knowledge gaps in frozen LLM data."
- **Beat 2** (6.25s): Documentation search - "Searches current documentation and APIs."
- **Beat 3** (6.25s): Knowledge synthesis - "Synthesizes up-to-date answers for your problems."
- **Beat 4** (6.25s): Context integration - "Integrates findings with your codebase context."
- **Output**: `step-3-generate.mp4` and `step-3-generate.webm`

### 4. WebStep4: Council of LLMs (30 seconds)
**File**: `src/compositions/WebStep4.tsx`
- **Beat 1** (7.5s): Multi-model generation - "Multiple AI models generate plans in parallel."
- **Beat 2** (7.5s): Plan comparison - "Compare approaches from different AI perspectives."
- **Beat 3** (7.5s): Deep synthesis - "AI architect performs deep synthesis of all plans."
- **Beat 4** (7.5s): Final review - "Review with notes. Edit directly before execution."
- **Output**: `step-4-merge.mp4` and `step-4-merge.webm`

## Video Formats

### MP4 (H.264) - Universal Compatibility
- **Codec**: libx264
- **CRF**: 23 (good quality/size balance)
- **Pixel Format**: yuv420p
- **Flags**: +faststart (for web streaming)
- **Audio**: Removed (silent videos)

### VP9/WebM - Modern Browsers, Better Compression
- **Codec**: libvpx-vp9
- **CRF**: 31 (VP9 scale, equivalent quality to H.264 CRF 23)
- **CPU Used**: 2 (balanced speed/quality)
- **Features**: row-mt, auto-alt-ref, lag-in-frames for better quality
- **Audio**: Removed (silent videos)

## Next Steps

1. **Review Videos**: Run individual Remotion render commands to preview each video
2. **Encode**: Once approved, run the encoding commands for MP4 and VP9 formats
3. **Upload to S3**: After encoding, upload to your S3 bucket
4. **CloudFront**: Files will be served via CloudFront at the URLs expected by the website

## Commands to Test Individual Videos

```bash
cd /Users/kirylkazlovich/dev/vibe-manager/product-videos/remotion-project

# Preview in browser
npx remotion studio

# Render individual videos for review
npx remotion render WebStep1 ../exports/website/step-1-test.mp4
npx remotion render WebStep2 ../exports/website/step-2-test.mp4
npx remotion render WebStep3 ../exports/website/step-3-test.mp4
npx remotion render WebStep4 ../exports/website/step-4-test.mp4
```

## Website Integration

The videos are automatically loaded in the HowItWorks component using:
```javascript
video: cdnUrl('/videos/step-X-name.mp4')
poster: cdnUrl('/images/step-X-poster.jpg')
```

The OptimizedVideo component handles:
- Lazy loading with intersection observer
- Autoplay when in view
- Fallback for load errors
- Poster image preloading