# Product Videos - Remotion Project Structure

This folder contains all video production assets and Remotion projects for creating product demonstration videos.

## 📁 Folder Structure

```
product-videos/
├── source-videos/       # Original video recordings
├── exports/             # Final rendered videos
├── templates/           # Reusable Remotion templates
└── remotion-project/    # Main Remotion project
```

## 📂 Directory Details

### `source-videos/`
Store all original video recordings here. These are the raw materials for your edits.
- **Format**: MOV, MP4, AVI, MKV, WEBM
- **Note**: Large video files are gitignored by default

### `exports/`
All rendered/exported videos from Remotion projects go here.
- `final/` - Production-ready videos
- `drafts/` - Work-in-progress exports
- `temp/` - Temporary exports (gitignored)

### `templates/`
Reusable Remotion composition templates for common video types:
- Product demos
- Tutorial videos
- Marketing content
- Social media clips

### `remotion-project/`
The main Remotion React project with organized structure:
```
remotion-project/
├── public/              # Static assets
│   └── assets/          # Videos, images, audio
├── src/
│   ├── compositions/    # Video compositions
│   ├── components/      # Reusable React components
│   ├── sequences/       # Scene sequences
│   ├── transitions/     # Transition effects
│   ├── hooks/          # Custom React hooks
│   ├── utils/          # Helper functions
│   ├── config/         # Configuration files
│   └── types/          # TypeScript definitions
```


## 🚀 Quick Start

### 1. Add a new source video
Place your video file in the `source-videos/` folder.

### 2. Start a new project
```bash
cd remotion-project
npm run workflow:new  # Syncs assets and starts Remotion Studio
```

### 3. Create a composition
Create your composition file in `src/compositions/YourVideo.tsx`

### 4. Render the video
```bash
# Quick draft render
npm run render:draft YourComposition ../exports/drafts/test.mp4

# Production render
npm run render:hd YourComposition ../exports/final.mp4

# Or use the workflow command
npm run workflow:render YourComposition ../exports/video.mp4
```

## 📝 Naming Conventions

### Source Videos
`YYYY-MM-DD_description.mov`
Example: `2025-08-14_audio-transcribe-demo.mov`

### Exports
`[project]_[version]_[date].mp4`
Example: `audio-transcribe_v2_2025-08-14.mp4`

### Compositions
PascalCase for components: `AudioTranscribe.tsx`

## 🎬 Common Workflows

### Creating a Speed-Modified Video
1. Place source video in `source-videos/`
2. Run `npm run sync:assets` to copy videos to Remotion
3. Create composition with `playbackRate` prop
4. Run `npm run render:hd CompositionName ../exports/output.mp4`

### Adding Text Overlays
1. Use `<Sequence>` components for timing
2. Create reusable text components in `src/components/`
3. Use `staticFile()` for asset references

### Creating Templates
1. Build a generic composition
2. Extract configurable props
3. Save to `templates/` for reuse

## 🛠 NPM Scripts Reference

### Development
```bash
npm run dev                 # Start Remotion Studio
npm run workflow:new        # Sync assets & start studio
```

### Asset Management
```bash
npm run sync:assets         # Copy videos from source-videos/
npm run prepare:assets      # Create asset directories
npm run copy:video          # Copy videos to public/assets/
```

### Rendering
```bash
npm run render:draft        # Quick low-quality render
npm run render:hd           # Full HD 1920x1080
npm run render:4k           # 4K UHD 3840x2160
npm run render:social       # Square 1080x1080
npm run render:vertical     # Vertical 1080x1920
npm run workflow:render     # Typecheck, lint, then render
```

### Utilities
```bash
npm run compositions        # List all compositions
npm run still:thumbnail     # Export frame as image
npm run info               # Show project status
npm run clean              # Clean cache files
npm run clean:exports      # Clean temporary exports
npm run benchmark          # Test render performance
```

## 📋 Best Practices

1. **Keep source videos organized** - Use descriptive names with dates
2. **Version your exports** - Include version numbers in filenames
3. **Use .gitkeep** - Keep folder structure in Git
4. **Compress large files** - Use appropriate codecs for distribution
5. **Document compositions** - Add comments explaining complex sequences
6. **Reuse components** - Build a library of common elements
7. **Test at low resolution** - Speed up development with lower quality previews

## 🔧 Configuration

### Video Settings (remotion.config.ts)
- Default FPS: 30
- Default Codec: H.264
- Default Quality: CRF 18

### Recommended Export Settings
- **Social Media**: 1080x1080 @ 30fps
- **YouTube**: 1920x1080 @ 30/60fps
- **Product Demos**: 3840x2160 @ 30fps

## Remotion Editing Plan Exports

The following compositions are aligned with `tasks/edit_1.md`:

| Composition ID | Target Filename | Duration | Status |
|----------------|-----------------|----------|--------|
| EndToEnd | end-to-end.mp4 | 35s | ✅ Ready |
| FileFinder | file-finder.mp4 | 28s | ✅ Ready |
| PlanSynthesis | plan-synthesis.mp4 | 24s | ✅ Ready |
| DeepCustomization | deep-customization.mp4 | 24s | ✅ Ready |
| CostTracking | cost-tracking.mp4 | 20s | ✅ Ready |
| DeepResearch | deep-research.mp4 | 22s | ⏳ Placeholder |

## 📚 Resources

- [Remotion Documentation](https://www.remotion.dev/docs)
- [React Best Practices](https://react.dev/learn)
- [FFmpeg Guide](https://ffmpeg.org/documentation.html)

## Studio Health Checklist

- [ ] Remotion packages pinned to same version (4.0.333)
- [ ] React 19 confirmed
- [ ] @remotion/tailwind enabled in config
- [ ] index.css imported in index.ts
- [ ] Master video present in public/assets/videos/
- [ ] No website globals.css imported
- [ ] All compositions visible in Studio sidebar

## 🤝 Contributing

1. Create feature branch
2. Add your composition to `src/compositions/`
3. Test thoroughly
4. Export sample video
5. Update this README if needed