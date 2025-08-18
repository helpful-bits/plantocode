import React from 'react';
import { Sequence, staticFile, useVideoConfig, OffthreadVideo, Img, useCurrentFrame } from 'remotion';
import { SOURCES } from '../config/sources';
import { timestampToFrames } from '../utils/time';
import { Caption } from '../components/Caption';
import { Watermark } from '../components/Watermark';
import { CameraMotion } from '../components/CameraMotion';

export const WebStep1: React.FC = () => {
  const { fps } = useVideoConfig();
  const videoSrc = staticFile(SOURCES.screen_master);
  
  // Calculate frame positions for all segments
  // Segment 1: Show session view from start (0:00 - 0:06)
  const seg1Start = 0;
  const seg1End = timestampToFrames('00:06:00', fps);
  const seg1SourceFrames = seg1End - seg1Start;
  const seg1Duration = seg1SourceFrames; // Show full 6 seconds at normal speed
  
  // Segment 2: User presses video transcribe (0:06 - 0:09)
  const seg2Start = timestampToFrames('00:06:00', fps);
  const seg2End = timestampToFrames('00:09:00', fps);
  const seg2SourceFrames = seg2End - seg2Start;
  const seg2Duration = seg2SourceFrames; // Show full 3 seconds at normal speed
  
  // Segment 3: 8x speed up (0:09 - 0:38)
  const seg3Start = timestampToFrames('00:09:00', fps);
  const seg3End = timestampToFrames('00:38:00', fps);
  const seg3SourceFrames = seg3End - seg3Start;
  const seg3Duration = Math.round(seg3SourceFrames / 8); // 8x speed
  
  // Segment 4: Pause for phone connection text (0:46)
  const seg4Start = timestampToFrames('00:46:00', fps);
  const seg4Duration = 120; // 2 seconds pause
  
  // Segment 5: Phone connected (1:27 - 1:56) at 3x speed
  const seg5Start = timestampToFrames('01:27:00', fps);
  const seg5End = timestampToFrames('01:56:00', fps);
  const seg5SourceFrames = seg5End - seg5Start;
  const seg5Duration = Math.round(seg5SourceFrames / 3); // 3x speed
  
  // Segment 6: Finishing description (2:15 - 2:17)
  const seg6Start = timestampToFrames('02:15:00', fps);
  const seg6End = timestampToFrames('02:17:00', fps);
  const seg6SourceFrames = seg6End - seg6Start;
  const seg6Duration = seg6SourceFrames; // Show full 2 seconds at normal speed
  
  // Segment 7: Fast forward analysis (3:15 - 3:51) at 8x speed
  const seg7Start = timestampToFrames('03:15:00', fps);
  const seg7End = timestampToFrames('03:51:00', fps);
  const seg7SourceFrames = seg7End - seg7Start;
  const seg7Duration = Math.round(seg7SourceFrames / 8); // 8x speed
  
  // Segment 8: Audio section intro (14:52 - 15:04) at normal speed
  const seg8Start = timestampToFrames('14:52:00', fps);
  const seg8End = timestampToFrames('15:04:00', fps);
  const seg8SourceFrames = seg8End - seg8Start;
  const seg8Duration = seg8SourceFrames; // Show full 12 seconds at normal speed
  
  // Segment 9: Audio processing (15:04 - 15:08) at 8x speed  
  const seg9Start = timestampToFrames('15:04:00', fps);
  const seg9End = timestampToFrames('15:08:00', fps);
  const seg9SourceFrames = seg9End - seg9Start;
  const seg9Duration = Math.round(seg9SourceFrames / 8); // 8x speed
  
  // Segment 10: Closing thought - pause on final frame
  const seg10Start = timestampToFrames('15:08:00', fps);
  const seg10Duration = 180; // 3 seconds for closing message
  
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
  const seg6FrameStart = currentFrame;
  currentFrame += seg6Duration;
  const seg7FrameStart = currentFrame;
  currentFrame += seg7Duration;
  const seg8FrameStart = currentFrame;
  currentFrame += seg8Duration;
  const seg9FrameStart = currentFrame;
  currentFrame += seg9Duration;
  const seg10FrameStart = currentFrame;
  currentFrame += seg10Duration;
  const totalDuration = currentFrame;
  
  return (
    <>
      {/* Segment 1: Show Vibe Manager session from beginning */}
      <Sequence from={seg1FrameStart} durationInFrames={seg1Duration}>
        <OffthreadVideo
          src={videoSrc}
          trimBefore={seg1Start}
          trimAfter={seg1End}
          muted={true}
          style={{ width: '100%', height: '100%' }}
        />
        <Caption text="Here's how a task session looks in Vibe Manager" timing="fade" />
      </Sequence>
      
      {/* Segment 2: User presses video transcribe button */}
      <Sequence from={seg2FrameStart} durationInFrames={seg2Duration}>
        <OffthreadVideo
          src={videoSrc}
          trimBefore={seg2Start}
          trimAfter={seg2End}
          muted={true}
          style={{ width: '100%', height: '100%' }}
        />
        <Caption text="Recording a screen to demonstrate the issue visually" timing="fade" />
      </Sequence>
      
      {/* Segment 3: 8x speed up processing */}
      <Sequence from={seg3FrameStart} durationInFrames={seg3Duration}>
        <OffthreadVideo
          src={videoSrc}
          trimBefore={seg3Start}
          trimAfter={seg3End}
          playbackRate={8}
          muted={true}
          style={{ width: '100%', height: '100%' }}
        />
        <Caption text="AI processes and analyzes the recording..." timing="fade" />
      </Sequence>
      
      {/* Segment 4: Pause for phone connection message */}
      <Sequence from={seg4FrameStart} durationInFrames={seg4Duration}>
        <OffthreadVideo
          src={videoSrc}
          trimBefore={seg4Start}
          trimAfter={seg4Start + 2} // Take 2 frames and loop them
          muted={true}
          style={{ width: '100%', height: '100%' }}
        />
        <Caption text="Connecting to mobile device to capture UI issues directly" timing="fade" />
      </Sequence>
      
      {/* Segment 5: Phone connected, showing issues at 3x speed */}
      <Sequence from={seg5FrameStart} durationInFrames={seg5Duration}>
        <OffthreadVideo
          src={videoSrc}
          trimBefore={seg5Start}
          trimAfter={seg5End}
          playbackRate={3}
          muted={true}
          style={{ width: '100%', height: '100%' }}
        />
        <Caption text="Recording mobile interface problems in real-time" timing="fade" />
      </Sequence>
      
      {/* Segment 6: Finishing description */}
      <Sequence from={seg6FrameStart} durationInFrames={seg6Duration}>
        <OffthreadVideo
          src={videoSrc}
          trimBefore={seg6Start}
          trimAfter={seg6End}
          muted={true}
          style={{ width: '100%', height: '100%' }}
        />
        <Caption text="Adding final details with voice narration" timing="fade" />
      </Sequence>
      
      {/* Segment 7: Fast forward through analysis at 8x speed */}
      <Sequence from={seg7FrameStart} durationInFrames={seg7Duration}>
        <OffthreadVideo
          src={videoSrc}
          trimBefore={seg7Start}
          trimAfter={seg7End}
          playbackRate={8}
          muted={true}
          style={{ width: '100%', height: '100%' }}
        />
        <Caption text="AI extracted all visual issues and generated technical specifications" timing="fade" />
      </Sequence>
      
      {/* Segment 8: Audio section intro */}
      <Sequence from={seg8FrameStart} durationInFrames={seg8Duration}>
        <OffthreadVideo
          src={videoSrc}
          trimBefore={seg8Start}
          trimAfter={seg8End}
          muted={true}
          style={{ width: '100%', height: '100%' }}
        />
        <Caption text="And now - a simple voice input" timing="fade" />
      </Sequence>
      
      {/* Segment 9: Audio processing at 8x speed */}
      <Sequence from={seg9FrameStart} durationInFrames={seg9Duration}>
        <OffthreadVideo
          src={videoSrc}
          trimBefore={seg9Start}
          trimAfter={seg9End}
          playbackRate={8}
          muted={true}
          style={{ width: '100%', height: '100%' }}
        />
        <Caption text="Voice instantly transcribed - capturing context faster than typing" timing="fade" />
      </Sequence>
      
      {/* Segment 10: Closing thought */}
      <Sequence from={seg10FrameStart} durationInFrames={seg10Duration}>
        <OffthreadVideo
          src={videoSrc}
          trimBefore={seg10Start}
          trimAfter={seg10Start + 2} // Hold on final frame
          muted={true}
          style={{ width: '100%', height: '100%' }}
        />
        <Caption text="From visual demos to voice notes - capture complex requirements in seconds, not hours" timing="fade" />
      </Sequence>
      
      <Watermark />
    </>
  );
};