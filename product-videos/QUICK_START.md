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

#### Render Specific Compositions
```bash
npm run render:AudioTranscribe     # Renders the AudioTranscribe composition
npx remotion render AudioTranscribe ../exports/audio-transcribe.mp4  # Custom render example
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

### Source Video Management

The master source video is stored at:
`product-videos/source-videos/Screen Recording 2025-08-16 at 13.42.27.mov`

**Note**: For DeepResearch rendering, place "Screen Recording 2025-08-16 at 22.47.15.mov" under source-videos and run sync:assets.

To sync assets to the Remotion project:
```bash
cd remotion-project
npm run sync:assets
```

This copies the source video to `public/assets/videos/` for use in compositions.

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

## ⏰ Timing Guidance

### Timestamp Conventions
- **3-part format**: `MM:SS:FF` (minutes:seconds:frames)
- **4-part format**: `HH:MM:SS:FF` (hours:minutes:seconds:frames)
- Our conversion utilities expect this format and convert to frame numbers at the composition's fps

### Speed Control
- **Normal speed**: 1x for critical UI interactions
- **Time-lapse**: 400-1000% for long operations (file searches, analysis)
- **Speed ramps**: Gradual acceleration/deceleration for smooth transitions
- **Quick cuts**: For showing parallel processes or rapid sequences

### Duration Guidelines
- **Hero clips**: 30-40 seconds maximum
- **Feature demos**: 15-25 seconds each
- **Quick highlights**: 10-18 seconds
- **Transitions**: 0.5-1 second between scenes

## 🔊 Sound Effects (SFX)

### Available SFX Files
Place SFX files in `public/sfx/`:
- `click.wav` - UI button clicks and interactions
- `whoosh.wav` - Smooth transitions and speed ramps
- `success.wav` - Task completions and confirmations
- `notification.wav` - New items appearing or updates

### SFX Usage in Compositions
```typescript
import { Audio, staticFile } from 'remotion';

// Play click sound at specific frame
<Audio
  src={staticFile('sfx/click.wav')}
  startFrom={120}  // Frame where click happens
  volume={0.3}     // Keep subtle
/>

// Whoosh for transitions
<Audio
  src={staticFile('sfx/whoosh.wav')}
  startFrom={300}
  volume={0.2}
/>
```

### SFX Best Practices
- **Keep volumes low**: 0.1-0.3 range to avoid overwhelming
- **Sync precisely**: Match SFX timing to visual events
- **Use sparingly**: Only for key interactions, not every UI element
- **Test playback**: Ensure SFX enhances rather than distracts

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

## Troubleshooting Studio Preview

If the Remotion Studio shows a blank preview:

1. **Package Versions**: Ensure all Remotion packages are pinned to the same 4.x version (no ^ or ~)
   - Check package.json for: remotion, @remotion/cli, @remotion/renderer, @remotion/bundler, @remotion/player
   - All should be at "4.0.333" or another consistent version

2. **React Version**: Keep React and react-dom at 19.0.0 (Remotion 4+ supports React 19)

3. **Tailwind Setup**: 
   - Use @remotion/tailwind and enableTailwind() in remotion.config.ts
   - Import "./index.css" as first line in src/index.ts
   - Ensure index.css has @tailwind directives

4. **Assets**: Run `npm run sync:assets` to ensure master video exists under public/assets/videos/

5. **DevTools Debug**: If still blank, open DevTools inside the preview iframe:
   - Check Console for errors
   - Check Network tab for 404s on video assets
   - Inspect Elements to see if content is hidden

## ⚠️ Important Best Practices

### DO NOT Import Website CSS
Never import website/src/app/globals.css into Remotion project.

### Video Component Best Practices
- **Prefer OffthreadVideo**: Use `OffthreadVideo` instead of `Video` for better performance
- **Use modern trimming**: Use `trimBefore` and `trimAfter` instead of deprecated `startFrom` and `endAt`
- **Keep videos muted**: All compositions should use muted video tracks (no background audio)

### Example of Correct Video Usage
```typescript
import { OffthreadVideo, staticFile } from 'remotion';

// ✅ Good - Modern API
<OffthreadVideo
  src={staticFile('assets/videos/demo.mov')}
  trimBefore={30}   // Start 30 frames in
  trimAfter={60}    // End 60 frames in
  muted             // No background audio
/>

// ❌ Deprecated - Avoid
<Video
  src={staticFile('assets/videos/demo.mov')}
  startFrom={30}    // Deprecated
  endAt={60}        // Deprecated
/>
```