import React from 'react';
import { Sequence, staticFile, useVideoConfig, OffthreadVideo } from 'remotion';
import { SOURCES } from '../config/sources';
import { timestampToFrames } from '../utils/time';
import { Caption } from '../components/Caption';
import { Watermark } from '../components/Watermark';
import { CameraMotion } from '../components/CameraMotion';

export const WebStep2: React.FC = () => {
  const { fps } = useVideoConfig();
  const videoSrc = staticFile(SOURCES.screen_master);
  
  // File finder workflow with AI-powered search
  
  // Segment 1: AI generates regex patterns (4:37 → 4:50) at 4.5x speed
  const seg1Start = timestampToFrames('04:37:00', fps);
  const seg1End = timestampToFrames('04:50:00', fps);
  const seg1SourceFrames = seg1End - seg1Start;
  const seg1Duration = Math.round(seg1SourceFrames / 4.5); // 4.5x speed
  
  // Segment 2: Apply filters and assess files (4:50 → 5:05) at 4.5x speed
  const seg2Start = timestampToFrames('04:50:00', fps);
  const seg2End = timestampToFrames('05:05:00', fps);
  const seg2SourceFrames = seg2End - seg2Start;
  const seg2Duration = Math.round(seg2SourceFrames / 4.5); // 4.5x speed
  
  // Segment 3: Find relevant files and dependencies (5:05 → 5:19) at 4.5x speed
  const seg3Start = timestampToFrames('05:05:00', fps);
  const seg3End = timestampToFrames('05:19:00', fps);
  const seg3SourceFrames = seg3End - seg3Start;
  const seg3Duration = Math.round(seg3SourceFrames / 4.5); // 4.5x speed
  
  // Segment 4: Apply files with "Use files" button (5:19 → 5:27) at normal speed
  const seg4Start = timestampToFrames('05:19:00', fps);
  const seg4End = timestampToFrames('05:27:00', fps);
  const seg4SourceFrames = seg4End - seg4Start;
  const seg4Duration = seg4SourceFrames; // Normal speed to show button interaction
  
  // Segment 5: Context ready, create plans (5:27 → 5:40) at 2x speed
  const seg5Start = timestampToFrames('05:27:00', fps);
  const seg5End = timestampToFrames('05:40:00', fps);
  const seg5SourceFrames = seg5End - seg5Start;
  const seg5Duration = Math.round(seg5SourceFrames / 2); // 2x speed
  
  // Calculate cumulative start times
  let currentFrame = 0;
  const seg1FrameStart = currentFrame;
  currentFrame += seg1Duration;
  const seg2FrameStart = currentFrame;
  currentFrame += seg2Duration;
  const seg3FrameStart = currentFrame;
  currentFrame += seg3Duration;
  const seg4FrameStart = currentFrame;
  currentFrame += seg4Duration;
  const seg5FrameStart = currentFrame;
  currentFrame += seg5Duration;
  const totalDuration = currentFrame;
  
  return (
    <>
      {/* Segment 1: AI generates regex patterns */}
      <Sequence from={seg1FrameStart} durationInFrames={seg1Duration}>
        <OffthreadVideo
          src={videoSrc}
          trimBefore={seg1Start}
          trimAfter={seg1End}
          playbackRate={4.5}
          muted={true}
          style={{ width: '100%', height: '100%' }}
        />
        <Caption text="AI generates smart regex patterns to search your codebase" timing="fade" />
      </Sequence>
      
      {/* Segment 2: Apply filters and assess */}
      <Sequence from={seg2FrameStart} durationInFrames={seg2Duration}>
        <OffthreadVideo
          src={videoSrc}
          trimBefore={seg2Start}
          trimAfter={seg2End}
          playbackRate={4.5}
          muted={true}
          style={{ width: '100%', height: '100%' }}
        />
        <Caption text="Patterns applied as filters - AI assesses file content relevance" timing="fade" />
      </Sequence>
      
      {/* Segment 3: Find relevant files and dependencies */}
      <Sequence from={seg3FrameStart} durationInFrames={seg3Duration}>
        <OffthreadVideo
          src={videoSrc}
          trimBefore={seg3Start}
          trimAfter={seg3End}
          playbackRate={4.5}
          muted={true}
          style={{ width: '100%', height: '100%' }}
        />
        <Caption text="Identifying core files and hunting for hidden dependencies" timing="fade" />
      </Sequence>
      
      {/* Segment 4: Use files button */}
      <Sequence from={seg4FrameStart} durationInFrames={seg4Duration}>
        <OffthreadVideo
          src={videoSrc}
          trimBefore={seg4Start}
          trimAfter={seg4End}
          muted={true}
          style={{ width: '100%', height: '100%' }}
        />
        <Caption text="One click - 'Use Files' applies AI's selections to your context" timing="fade" />
      </Sequence>
      
      {/* Segment 5: Context ready for plans */}
      <Sequence from={seg5FrameStart} durationInFrames={seg5Duration}>
        <OffthreadVideo
          src={videoSrc}
          trimBefore={seg5Start}
          trimAfter={seg5End}
          playbackRate={2}
          muted={true}
          style={{ width: '100%', height: '100%' }}
        />
        <Caption text="Context assembled - generating implementation plans from multiple AI providers simultaneously" timing="fade" />
      </Sequence>
      
      <Watermark />
    </>
  );
};