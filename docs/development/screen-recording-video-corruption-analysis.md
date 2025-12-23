# Screen Recording Video Corruption Analysis

## Issue Summary

Screen recordings created by the desktop app have corrupted WebM container metadata:
- `duration=N/A`
- `bit_rate=N/A`
- Files require FFmpeg remuxing to fix metadata

This causes the video analysis processor to fail with:
```
Processing error: Chunk 1 analysis failed: Invalid argument: Missing or invalid 'duration_ms' field
```

## Root Cause

The screen recording implementation uses a **streaming-to-disk** approach that bypasses WebM container finalization.

### How Recording Works

**File:** `desktop/src/contexts/screen-recording/Provider.tsx`

1. `MediaRecorder` is configured with `recorder.start(1000)` - fires `ondataavailable` every 1000ms
2. Each chunk is immediately appended to disk via `enqueueAppend()` → `append_binary_file_command`
3. When recording stops, chunks are flushed but the WebM container header is never updated

### Why This Causes Corruption

WebM (based on Matroska) container format requires:
- **Duration** to be written in the EBML header
- **Bitrate** and other metadata to be calculated after all frames are captured
- The container to be properly "sealed"

**The problem:** Duration is unknown until recording stops, but the header is written at the start. The streaming approach never goes back to update the header.

### Previous Implementation (Working)

```typescript
// Accumulate chunks in memory
recorder.ondataavailable = (event) => {
  if (event.data && event.data.size > 0) {
    chunksRef.current.push(event.data);
  }
};

recorder.onstop = async () => {
  // Browser finalizes WebM container when creating Blob
  const blob = new Blob(chunksRef.current, { type: 'video/webm' });

  const arrayBuffer = await blob.arrayBuffer();
  await invoke('write_binary_file_command', { path, content: Array.from(new Uint8Array(arrayBuffer)) });
};
```

**Why it worked:** `new Blob([chunks], { type: 'video/webm' })` triggers the browser to properly finalize the WebM container with correct metadata.

### Current Implementation (Broken)

```typescript
// Stream chunks directly to disk
recorder.ondataavailable = async (event) => {
  const arrayBuffer = await event.data.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  enqueueAppend(uint8Array);  // Raw bytes appended to file
};

recorder.onstop = async () => {
  await appendQueueRef.current;  // Wait for all chunks
  // NO CONTAINER FINALIZATION - WebM header never updated
};
```

## Technical Details

### WebM/Matroska Structure

```
EBML Header
└── Segment
    ├── SeekHead (index)
    ├── Info
    │   ├── Duration ← THIS IS THE PROBLEM (unknown/unset)
    │   ├── TimecodeScale
    │   └── MuxingApp
    ├── Tracks
    └── Clusters (actual video/audio data)
```

When MediaRecorder streams data:
- It writes the header with `Duration = -1` (unknown)
- Clusters are appended as they're recorded
- **No mechanism exists to update the header after recording stops**

### Why `new Blob()` Works

The browser's Blob constructor for media types:
1. Parses all input chunks
2. Recalculates container metadata
3. Produces a properly-formed file with correct duration

This is essentially a remux operation happening in the browser.

## Potential Solutions

### Option 1: Revert to Memory-Based Approach

**Pros:**
- Simple, proven to work
- No external dependencies

**Cons:**
- Memory usage: 5 Mbps × 5 minutes = ~188 MB in RAM
- Long recordings (10+ minutes) may cause memory pressure
- Risk of data loss if app crashes during recording

**Implementation:** Revert `ondataavailable` to accumulate `Blob` chunks, create final `Blob` in `onstop`.

### Option 2: Hybrid Approach - Stream Then Finalize

**Pros:**
- Low memory during recording
- Proper finalization at end

**Cons:**
- Still requires reading entire file into memory at end
- Essentially same memory peak as Option 1

**Implementation:**
1. Stream chunks to disk during recording
2. On stop, read file back into memory
3. Create Blob from data
4. Write finalized Blob back to disk

### Option 3: FFmpeg Post-Processing (Implemented but Rejected)

**Pros:**
- Industry-standard solution (used by OBS, etc.)
- Fast (stream copy, no re-encoding)
- Keeps memory-efficient streaming

**Cons:**
- Requires FFmpeg dependency
- Additional processing step
- Adds complexity

**Implementation:** Call `ffmpeg -i input.webm -c copy -fflags +genpts output.webm` after recording stops.

### Option 4: Manual WebM Header Patching

**Pros:**
- No external dependencies
- Memory efficient
- Fast (only patches header bytes)

**Cons:**
- Complex implementation
- Requires deep understanding of EBML/WebM format
- Error-prone, hard to maintain

**Implementation:** After recording, seek to Duration element position in file and write calculated value.

### Option 5: Use Different Container Format

**Pros:**
- Some formats handle streaming better

**Cons:**
- Browser support varies
- May not solve the fundamental issue

**Consideration:** MP4 with fragmented format (`fmp4`) handles streaming better but browser support for recording is limited.

## Recommendation

**Short-term:** Revert to memory-based approach (Option 1) with a reasonable recording length limit (e.g., 10 minutes warning, 30 minutes hard limit).

**Long-term:** Implement Option 4 (manual header patching) for a proper solution that maintains streaming benefits without external dependencies.

## Files Involved

| File | Purpose |
|------|---------|
| `desktop/src/contexts/screen-recording/Provider.tsx` | Recording logic, chunk handling |
| `desktop/src-tauri/src/utils/fs_utils.rs` | `append_bytes_to_file` function |
| `desktop/src-tauri/src/utils/ffmpeg_utils.rs` | `probe_duration_ms` with fallbacks |
| `desktop/src-tauri/src/jobs/processors/video_analysis_processor.rs` | Fails when duration unavailable |

## Verification

To verify a WebM file has proper metadata:

```bash
# Check metadata
ffprobe -v error -show_entries format=duration,bit_rate -of default=noprint_wrappers=1 video.webm

# Expected (good):
# duration=269.510000
# bit_rate=1033794

# Actual (broken):
# duration=N/A
# bit_rate=N/A
```

To fix a broken file manually:

```bash
ffmpeg -i broken.webm -c copy -fflags +genpts fixed.webm
```
