# Quick Start Guide - Video Production

## 🎬 Common Commands

### Development
```bash
cd remotion-project
npm run dev              # Start Remotion Studio
```

### Rendering Videos

#### Quick Renders
```bash
npm run render:draft     # Fast, lower quality for previews
npm run render:mp4       # Standard MP4 output
npm run render:hd        # Full HD 1920x1080
npm run render:4k        # 4K UHD 3840x2160
npm run render:social    # Square 1080x1080 for social media
```

#### Custom Render
```bash
npx remotion render [CompositionName] ../exports/[filename].mp4
```

#### Render Specific Composition
```bash
npm run render:AudioTranscribe  # Renders the AudioTranscribe composition
```

### Other Useful Commands
```bash
npm run compositions     # List all available compositions
npm run still           # Export a single frame
npm run preview         # Preview a specific composition
npm run benchmark       # Test rendering performance
npm run clean           # Clean cache and temporary files
npm run typecheck       # Check TypeScript types
npm run lint            # Run linting
```

## 📁 Where Files Go

| File Type | Location | Example |
|-----------|----------|---------|
| Source Videos | `source-videos/` | `2025-08-14_demo.mov` |
| Assets for Remotion | `remotion-project/public/assets/videos/` | `demo.mov` |
| Rendered Videos | `exports/` | `demo_final.mp4` |
| Compositions | `remotion-project/src/compositions/` | `DemoVideo.tsx` |
| Templates | `templates/` | `SpeedRampTemplate.tsx` |

## 🚀 Creating a New Video

1. **Add Source Video**
   ```bash
   # Place video in source folder
   mv your-video.mov source-videos/
   
   # Sync to Remotion project
   cd remotion-project
   npm run sync:assets
   ```

2. **Create Composition**
   Create file in `remotion-project/src/compositions/YourVideo.tsx`

3. **Register in Root.tsx**
   ```typescript
   import { YourVideo } from "./compositions/YourVideo";
   
   <Composition
     id="YourVideo"
     component={YourVideo}
     durationInFrames={300}
     fps={30}
     width={1920}
     height={1080}
   />
   ```

4. **Render**
   ```bash
   npm run render YourVideo ../exports/your-video.mp4
   ```

## 💡 Tips

- Use `npm run render:draft` for quick previews
- Keep source videos under 500MB for better performance
- Use `staticFile("assets/videos/your-video.mov")` to reference videos
- Test compositions at lower resolution first
- Use the SpeedRampTemplate for common speed-up effects

## 🎯 Examples

### Render with custom settings
```bash
npx remotion render MyVideo ../exports/my-video.mp4 --quality 95 --codec h264
```

### Export thumbnail
```bash
npx remotion still MyVideo ../exports/thumbnail.png --frame 0
```

### List all compositions
```bash
npm run compositions
```