import React from 'react';
import { Sequence, staticFile, useVideoConfig, OffthreadVideo } from 'remotion';
import { SOURCES } from '../config/sources';
import { timestampToFrames } from '../utils/time';
import { Caption } from '../components/Caption';
import { Watermark } from '../components/Watermark';
import { CameraMotion } from '../components/CameraMotion';

export const WebStep3: React.FC = () => {
  const { fps } = useVideoConfig();
  const videoSrc = staticFile(SOURCES.screen_deep_research); // Using second recording for deep research
  
  // 25 second video showcasing Deep Research workflow
  const totalDuration = 1500; // 25 seconds at 60fps
  
  // Beat 1: Initiate Deep Research (00:00:00 → 00:04:00)
  const beat1Start = timestampToFrames('00:00:00', fps);
  const beat1End = timestampToFrames('00:04:00', fps);
  const beat1SourceFrames = beat1End - beat1Start;
  const beat1Duration = 375; // 6.25 seconds
  const beat1PlaybackRate = beat1SourceFrames / beat1Duration;
  
  // Beat 2: Web Search Generation (00:04:00 → 00:38:00)
  const beat2Start = timestampToFrames('00:04:00', fps);
  const beat2End = timestampToFrames('00:38:00', fps);
  const beat2SourceFrames = beat2End - beat2Start;
  const beat2Duration = 375; // 6.25 seconds
  const beat2PlaybackRate = beat2SourceFrames / beat2Duration;
  
  // Beat 3: Research Results (00:38:00 → 00:55:00)
  const beat3Start = timestampToFrames('00:38:00', fps);
  const beat3End = timestampToFrames('00:55:00', fps);
  const beat3SourceFrames = beat3End - beat3Start;
  const beat3Duration = 375; // 6.25 seconds
  const beat3PlaybackRate = beat3SourceFrames / beat3Duration;
  
  // Beat 4: Context Integration (00:55:00 → 01:40:00)
  const beat4Start = timestampToFrames('00:55:00', fps);
  const beat4End = timestampToFrames('01:40:00', fps);
  const beat4SourceFrames = beat4End - beat4Start;
  const beat4Duration = 375; // 6.25 seconds
  const beat4PlaybackRate = beat4SourceFrames / beat4Duration;
  
  return (
    <>
      {/* Beat 1: Initiate Deep Research */}
      <Sequence from={0} durationInFrames={beat1Duration}>
        <CameraMotion linearZoomRange={[60, 180, 1, 1.1]}>
          <OffthreadVideo
            src={videoSrc}
            trimBefore={beat1Start}
            trimAfter={beat1End}
            playbackRate={beat1PlaybackRate}
            muted={true}
            style={{ width: '100%', height: '100%' }}
          />
        </CameraMotion>
        <Caption text="Deep Research searches for current documentation." timing="fade" />
      </Sequence>
      
      {/* Beat 2: AI Generates Search Prompts */}
      <Sequence from={beat1Duration} durationInFrames={beat2Duration}>
        <CameraMotion panYRange={[0, beat2Duration * 0.5, 0, -60]}>
          <OffthreadVideo
            src={videoSrc}
            trimBefore={beat2Start}
            trimAfter={beat2End}
            playbackRate={beat2PlaybackRate}
            muted={true}
            style={{ width: '100%', height: '100%' }}
          />
        </CameraMotion>
        <Caption text="AI generates targeted research prompts automatically." timing="fade" />
      </Sequence>
      
      {/* Beat 3: Research Results */}
      <Sequence from={beat1Duration + beat2Duration} durationInFrames={beat3Duration}>
        <CameraMotion springZoomRange={[30, 1.08]}>
          <OffthreadVideo
            src={videoSrc}
            trimBefore={beat3Start}
            trimAfter={beat3End}
            playbackRate={beat3PlaybackRate}
            muted={true}
            style={{ width: '100%', height: '100%' }}
          />
        </CameraMotion>
        <Caption text="Comprehensive findings with code examples and best practices." timing="fade" />
      </Sequence>
      
      {/* Beat 4: Ready for Implementation */}
      <Sequence from={beat1Duration + beat2Duration + beat3Duration} durationInFrames={beat4Duration}>
        <CameraMotion linearZoomRange={[90, 270, 1, 1.12]}>
          <OffthreadVideo
            src={videoSrc}
            trimBefore={beat4Start}
            trimAfter={beat4End}
            playbackRate={beat4PlaybackRate}
            muted={true}
            style={{ width: '100%', height: '100%' }}
          />
        </CameraMotion>
        <Caption text="Up-to-date knowledge integrated with your task context." timing="fade" />
      </Sequence>
      
      <Watermark />
    </>
  );
};