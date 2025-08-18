# Remotion Project

This directory contains the Remotion project for generating product videos.

## Health Checklist

Before working with this project, ensure the following requirements are met:

- ✅ **Remotion v4.0.333 alignment confirmed** - All Remotion packages are pinned to the same 4.x version
- ✅ **Assets synced under public/assets/videos** - Source videos are available in the correct location
- ❌ **No import of website/src/app/globals.css in Remotion project** - Never import website globals into Remotion
- ⚠️ **Prefer OffthreadVideo; avoid deprecated startFrom/endAt** - Use trimBefore/trimAfter instead
- ✅ **All compositions use muted video tracks** - No background audio to prevent conflicts

## Best Practices

1. **Video Components**: Always use `OffthreadVideo` for better performance
2. **Trimming**: Use `trimBefore` and `trimAfter` instead of deprecated `startFrom` and `endAt`
3. **Audio**: Keep all video tracks muted to avoid background audio conflicts
4. **CSS**: Do NOT import `website/src/app/globals.css` into this Remotion project
5. **Assets**: Ensure assets are synced to `public/assets/videos/` using `npm run sync:assets`

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Sync assets from source videos
npm run sync:assets

# Render a composition
npx remotion render [CompositionName] ../exports/[filename].mp4
```

## Available Compositions

See the complete list in `src/Root.tsx`. Current compositions include:
- EndToEnd
- FileFinder (20s)
- PlanSynthesis
- DeepCustomization
- CostTracking (15s)
- ✅ DeepResearch (implemented)
- TaskInputRefinement
- VoiceTranscription

**Baseline**: 60fps/1080p for all compositions

## Timing and Units

Always use timestampToFrames(..., fps). OffthreadVideo trimBefore/trimAfter accept FRAMES. For time-lapse/ramp beats, choose playbackRate so sourceFrames/targetFrames are matched; favor SpeedRampVideo for slow-fast-slow beats.

## SFX (optional)

Place files under public/sfx/ (gitignored). Compositions will attempt to play them if present. Keep source tracks muted. No background music.