# Vibe Manager Presentation → Video Creation Guide

Complete guide for adding transitions and creating professional marketing videos.

---

## 📁 Files

- **`vibe-manager-professional.pptx`** - Main presentation
- **`add_transitions.py`** - Add smooth fade transitions
- **`generate_video.py`** - Export to video with FFmpeg
- **`generate_professional_presentation.py`** - Regenerate presentation

---

## 🎬 Method 1: Add Transitions to PowerPoint (Recommended)

### Using Python Script

```bash
# Activate virtual environment
source .venv/bin/activate

# Add transitions (400ms fade)
python add_transitions.py

# Output: vibe-manager-professional-with-transitions.pptx
```

### Manual in PowerPoint

1. Open `vibe-manager-professional.pptx`
2. Select all slides (Cmd+A in slide sorter)
3. Go to **Transitions** tab
4. Choose **Fade** or **Push**
5. Set duration: **0.40s** (400ms)
6. Click **Apply to All**

**Recommended Transitions:**
- **Fade** - Most professional, smooth
- **Push** - Directional, clean
- **Morph** - Advanced content morphing (PowerPoint 2016+)
- **Wipe** - Modern, directional

---

## 🎥 Method 2: Create Video - PowerPoint Export (Best Quality)

### macOS/Windows

1. **Open** presentation in PowerPoint
2. **File** → **Export** → **Create a Video**
3. **Settings:**
   - Quality: **Full HD (1920 × 1080)**
   - Seconds per slide: **8 seconds**
   - Use recorded timings: **No** (unless you want narration)
4. **Create Video** → Save as `vibe-manager-video.mp4`

**Pro Tips:**
- Record narration: Set up voiceover per slide
- Custom timings: Record slide show with specific durations
- Add animations: Use slide animations before export

---

## 🎥 Method 3: Create Video - Keynote (Mac)

### Steps

1. **Open** PPTX in Keynote (auto-converts)
2. **File** → **Export To** → **Movie...**
3. **Settings:**
   - Resolution: **1080p**
   - Format: **H.264**
   - Slide Duration: **8.00 seconds**
   - Include Transitions: **✓**
4. **Next** → Save

**Keynote Advantages:**
- Better font rendering on Mac
- Smoother transitions
- Smaller file sizes
- Native M1/M2 optimization

---

## 🎥 Method 4: Python + FFmpeg (Automated)

### Prerequisites

```bash
# Install FFmpeg
brew install ffmpeg  # macOS
# sudo apt install ffmpeg  # Linux

# Install optional tools for slide export
brew install --cask libreoffice  # For PPTX → PDF conversion
brew install imagemagick  # For PDF → PNG conversion
```

### Basic Video Generation

```bash
source .venv/bin/activate

# Simple video (no transitions)
python generate_video.py --pptx vibe-manager-professional.pptx

# With smooth crossfade transitions
python generate_video.py --pptx vibe-manager-professional.pptx --with-transitions

# Custom slide duration (12 seconds per slide)
python generate_video.py --slide-duration 12

# With background music
python generate_video.py --audio background-music.mp3
```

### Advanced Options

```bash
# Show manual instructions
python generate_video.py --manual

# Full customization
python generate_video.py \
  --pptx vibe-manager-professional.pptx \
  --output final-video.mp4 \
  --with-transitions \
  --audio music/background.mp3 \
  --slide-duration 10
```

### Manual FFmpeg (Fine Control)

```bash
# Export slides from PowerPoint as images first:
# File → Export → Change File Type → PNG → Export All Slides

# Create video from exported images
ffmpeg -framerate 1/8 -pattern_type glob -i 'slides/*.png' \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" \
  -c:v libx264 -r 30 -pix_fmt yuv420p \
  output.mp4

# With crossfade transitions
ffmpeg -loop 1 -t 8 -i slide_00.png \
  -loop 1 -t 8 -i slide_01.png \
  -loop 1 -t 8 -i slide_02.png \
  -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.5:offset=7.5[v1]; \
                   [v1][2:v]xfade=transition=fade:duration=0.5:offset=15.5[v2]" \
  -map "[v2]" -c:v libx264 -pix_fmt yuv420p output.mp4

# Add background music
ffmpeg -i video.mp4 -i music.mp3 -c:v copy -c:a aac -b:a 192k -shortest final.mp4
```

---

## 🎨 Video Configuration

### Recommended Settings

| Setting | Value | Reason |
|---------|-------|--------|
| Resolution | 1920×1080 (1080p) | Standard HD, widely supported |
| Frame Rate | 30 fps | Smooth playback |
| Codec | H.264 (libx264) | Universal compatibility |
| Bitrate | 8000k | High quality without huge files |
| Slide Duration | 8-10 seconds | Enough time to read content |
| Transition | 0.4-0.5 seconds | Professional, not too fast |

### For Different Platforms

**YouTube:**
- Resolution: 1920×1080 or 3840×2160 (4K)
- Bitrate: 8-12 Mbps (1080p), 35-45 Mbps (4K)
- Format: MP4 (H.264)

**LinkedIn/Twitter:**
- Resolution: 1920×1080
- Bitrate: 5-8 Mbps
- Max duration: 10 minutes (LinkedIn), 2:20 (Twitter)
- Square format (1080×1080) performs better

**Instagram:**
- Resolution: 1080×1080 (square) or 1080×1920 (story)
- Duration: 60 seconds max (feed), 15 seconds (story)
- Format: MP4 (H.264)

---

## 🎵 Adding Audio

### Background Music Sources (Royalty-Free)

1. **Epidemic Sound** - https://www.epidemicsound.com
2. **Artlist** - https://artlist.io
3. **YouTube Audio Library** - Free, built-in
4. **Free Music Archive** - https://freemusicarchive.org

### Recommended Music Style

For tech/SaaS presentations:
- **Genre:** Electronic, Ambient, Corporate
- **Mood:** Professional, Modern, Uplifting
- **BPM:** 100-120 (moderate energy)
- **Volume:** -20 to -15 dB (subtle, not overpowering)

### Add Music with FFmpeg

```bash
# Simple audio overlay
ffmpeg -i video.mp4 -i background.mp3 \
  -c:v copy -c:a aac -b:a 192k \
  -shortest output_with_music.mp4

# Adjust audio volume (-15dB reduction)
ffmpeg -i video.mp4 -i background.mp3 \
  -filter_complex "[1:a]volume=-15dB[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac \
  -shortest output_with_music.mp4

# Fade in/out audio
ffmpeg -i video.mp4 -i background.mp3 \
  -filter_complex "[1:a]afade=t=in:st=0:d=3,afade=t=out:st=117:d=3[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac \
  -shortest output.mp4
```

---

## 🎙️ Adding Voiceover

### Option 1: Record in PowerPoint

1. Open presentation in PowerPoint
2. **Slide Show** → **Record Slide Show**
3. Use microphone to narrate each slide
4. **File** → **Export** → **Create a Video**
5. Select "Use Recorded Timings and Narrations"

### Option 2: Professional Voiceover Services

**AI Voiceover (Fast & Affordable):**
- **ElevenLabs** - https://elevenlabs.io (realistic AI voices)
- **Murf.ai** - https://murf.ai
- **Descript** - https://www.descript.com

**Human Voiceover (High Quality):**
- **Fiverr** - Starting at $50
- **Voices.com** - Professional marketplace
- **Upwork** - Freelance talent

### Script Template

```
SLIDE 1 (8 sec):
"Vibe Manager: Intelligent code scope isolation.
From 1,500 files to production-ready features in just 5 minutes."

SLIDE 2 (8 sec):
"Modern developers face a challenge: navigating massive codebases
with thousands of files, spending hours finding relevant code."

[Continue for each slide...]
```

---

## 📊 Video Optimization

### Compress Video (Reduce File Size)

```bash
# Good quality, smaller size
ffmpeg -i input.mp4 -c:v libx264 -crf 23 -preset slow \
  -c:a aac -b:a 128k output_compressed.mp4

# Even smaller (for web)
ffmpeg -i input.mp4 -c:v libx264 -crf 28 -preset slow \
  -vf "scale=1280:720" -c:a aac -b:a 96k output_web.mp4
```

### Add Captions/Subtitles

```bash
# Create SRT subtitle file first, then:
ffmpeg -i video.mp4 -vf subtitles=captions.srt output.mp4

# Burn-in captions (cannot be disabled)
ffmpeg -i video.mp4 -vf "subtitles=captions.srt:force_style='FontSize=24'" output.mp4
```

---

## 🚀 Quick Start Workflow

### Complete Production Pipeline

```bash
# 1. Activate environment
source .venv/bin/activate

# 2. (Optional) Regenerate presentation with updates
# python generate_professional_presentation.py

# 3. Add transitions to presentation
python add_transitions.py

# 4. Export slides from PowerPoint as high-quality images
# File → Export → PNG → Export All Slides → slides/

# 5. Generate video with transitions
python generate_video.py \
  --pptx vibe-manager-professional-with-transitions.pptx \
  --with-transitions \
  --slide-duration 8 \
  --output vibe-manager-final.mp4

# 6. (Optional) Add background music
ffmpeg -i vibe-manager-final.mp4 -i background-music.mp3 \
  -filter_complex "[1:a]volume=-15dB[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -shortest \
  vibe-manager-with-music.mp4

# 7. Upload to YouTube/Vimeo
```

---

## 💡 Pro Tips

### For Maximum Quality

1. **Export slides from PowerPoint directly** - Best quality, easiest
2. **Use 4K resolution** - Future-proof, scales down well
3. **Add subtle animations** - Per-slide build animations add polish
4. **Professional voiceover** - Dramatically increases engagement
5. **Background music** - Subtle, professional tracks enhance mood

### For Maximum Engagement

1. **Keep it concise** - 2-3 minutes ideal for social media
2. **Strong hook** - First 5 seconds are critical
3. **Clear CTA** - End with obvious next step
4. **Captions** - 85% of videos watched without sound
5. **Square format** - Better for social media feeds

### For Multiple Platforms

```bash
# YouTube (1080p horizontal)
ffmpeg -i master.mp4 -vf "scale=1920:1080" youtube.mp4

# Instagram Feed (square)
ffmpeg -i master.mp4 -vf "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2" instagram.mp4

# Instagram Story (vertical)
ffmpeg -i master.mp4 -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" story.mp4

# Twitter (720p)
ffmpeg -i master.mp4 -vf "scale=1280:720" -c:v libx264 -crf 28 twitter.mp4
```

---

## 🐛 Troubleshooting

### "FFmpeg not found"
```bash
brew install ffmpeg  # macOS
sudo apt install ffmpeg  # Linux
```

### "LibreOffice conversion failed"
Use PowerPoint/Keynote export instead:
- File → Export → Images (PNG)
- Then run video generation script

### "Video quality is poor"
1. Export slides at higher resolution from PowerPoint
2. Increase FFmpeg bitrate: `-b:v 12000k`
3. Use lossless preset: `-preset veryslow -crf 18`

### "Audio out of sync"
```bash
# Re-sync audio
ffmpeg -i video.mp4 -i audio.mp3 -c:v copy -c:a aac \
  -async 1 -shortest output.mp4
```

---

## 📚 Additional Resources

### Learning

- **FFmpeg Documentation:** https://ffmpeg.org/documentation.html
- **Video Marketing Guide:** https://wistia.com/learn/marketing
- **Presentation Tips:** https://www.presentation-guru.com

### Tools

- **Descript:** All-in-one video editor with AI
- **Loom:** Quick screen recording
- **Canva:** Easy video editing
- **Kapwing:** Online video tools

---

## ✅ Checklist

Before sharing your video:

- [ ] Transitions are smooth (0.4-0.5s)
- [ ] Slide duration is appropriate (8-10s)
- [ ] Audio levels are balanced (-15dB for music)
- [ ] Video quality is 1080p minimum
- [ ] Captions/subtitles added (if applicable)
- [ ] Tested on target platform
- [ ] File size is reasonable (<100MB for most platforms)
- [ ] Call-to-action is clear
- [ ] Branding is consistent
- [ ] Copyright/music rights cleared

---

**Need help?** Check the troubleshooting section or contact the team.

**Questions?** Open an issue or reach out to hello@vibemanager.app
