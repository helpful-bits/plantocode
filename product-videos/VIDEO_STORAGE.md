# Video Storage Strategy

## ⚠️ Important: Videos are NOT stored in Git

Video files are large binary files that should **never** be committed to Git. They will:
- Bloat the repository size
- Make cloning extremely slow
- Use up Git LFS bandwidth unnecessarily

## 📁 Where Videos Should Be Stored

### Option 1: Local Development Only
Keep videos on your local machine only. The folder structure exists in Git, but videos are ignored:
- `source-videos/*` - All ignored except `.gitkeep`
- `exports/*` - All ignored except `.gitkeep`
- `remotion-project/public/assets/videos/*` - All ignored except `.gitkeep`

### Option 2: Cloud Storage (Recommended for Teams)
Store videos in cloud services:
- **AWS S3** - Great for production assets
- **Google Drive** - Good for collaboration
- **Dropbox** - Easy sharing with clients
- **Backblaze B2** - Cost-effective for archives

### Option 3: CDN for Production
For final videos that need to be accessed by users:
- **Cloudflare Stream**
- **AWS CloudFront + S3**
- **Vimeo/YouTube** (for public content)

## 🔄 Workflow

### Development
1. Download source videos from cloud storage to `source-videos/`
2. Run `npm run sync:assets` to copy to Remotion
3. Work on compositions
4. Render to `exports/`
5. Upload final videos to cloud/CDN

### Sharing
Instead of committing videos, share:
- Links to cloud storage
- Documentation about which videos to use
- Composition code (which IS in Git)

## 📝 Best Practices

1. **Use .gitignore** - Already configured to exclude all video files
2. **Document video sources** - Keep a `VIDEO_SOURCES.md` with links
3. **Use placeholders** - For testing, use small placeholder videos
4. **Compress for preview** - Create low-res versions for development
5. **Clean regularly** - Run `npm run clean:exports` to remove local exports

## 🎬 Example VIDEO_SOURCES.md

```markdown
# Video Sources

## Product Demo Videos
- `audio-transcribe-demo.mov` - [S3 Link](https://...)
- `feature-walkthrough.mp4` - [Google Drive](https://...)

## Stock Footage
- `background-loop.mp4` - [Pexels](https://...)
```

## 🚀 Quick Commands

```bash
# Clean local video files (careful!)
rm -rf source-videos/*.mov source-videos/*.mp4
rm -rf exports/*.mp4
rm -rf remotion-project/public/assets/videos/*.mov

# Check repository size
git count-objects -vH

# Find large files accidentally committed
git rev-list --objects --all | grep -E '\.mov|\.mp4|\.avi'
```

## ⚙️ Git LFS (Not Recommended)

If you absolutely must version videos, use Git LFS, but be aware of:
- Bandwidth costs
- Storage limits
- Slower clone times

```bash
# Setup Git LFS (if needed)
git lfs track "*.mov"
git lfs track "*.mp4"
```

We recommend cloud storage instead.