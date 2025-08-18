import React from 'react';
import { Sequence, staticFile, useVideoConfig, OffthreadVideo } from 'remotion';
import { SOURCES } from '../config/sources';
import { timestampToFrames } from '../utils/time';
import { Caption } from '../components/Caption';
import { Watermark } from '../components/Watermark';
import { CameraMotion } from '../components/CameraMotion';

export const WebStep4: React.FC = () => {
  const { fps } = useVideoConfig();
  const videoSrc = staticFile(SOURCES.screen_master);
  
  // 30 second video showcasing Council of LLMs and Plan Merging
  const totalDuration = 1800; // 30 seconds at 60fps
  
  // Beat 1: Multiple model generation (05:37:00 → 06:27:00)
  const beat1Start = timestampToFrames('05:37:00', fps);
  const beat1End = timestampToFrames('06:27:00', fps);
  const beat1SourceFrames = beat1End - beat1Start;
  const beat1Duration = 450; // 7.5 seconds
  const beat1PlaybackRate = beat1SourceFrames / beat1Duration;
  
  // Beat 2: View and select plans (06:27:00 → 06:39:00)
  const beat2Start = timestampToFrames('06:27:00', fps);
  const beat2End = timestampToFrames('06:39:00', fps);
  const beat2SourceFrames = beat2End - beat2Start;
  const beat2Duration = 450; // 7.5 seconds
  const beat2PlaybackRate = beat2SourceFrames / beat2Duration;
  
  // Beat 3: Merge plans (08:07:00 → 09:32:00)
  const beat3Start = timestampToFrames('08:07:00', fps);
  const beat3End = timestampToFrames('09:32:00', fps);
  const beat3SourceFrames = beat3End - beat3Start;
  const beat3Duration = 450; // 7.5 seconds
  const beat3PlaybackRate = beat3SourceFrames / beat3Duration;
  
  // Beat 4: View merged result (09:38:00 → 10:40:00) - shortened to avoid exceeding 16x
  const beat4Start = timestampToFrames('09:38:00', fps);
  const beat4End = timestampToFrames('10:40:00', fps);
  const beat4SourceFrames = beat4End - beat4Start;
  const beat4Duration = 450; // 7.5 seconds
  const beat4PlaybackRate = beat4SourceFrames / beat4Duration;
  
  return (
    <>
      {/* Beat 1: Multiple Model Generation */}
      <Sequence from={0} durationInFrames={beat1Duration}>
        <CameraMotion springZoomRange={[30, 1.05]}>
          <OffthreadVideo
            src={videoSrc}
            trimBefore={beat1Start}
            trimAfter={beat1End}
            playbackRate={beat1PlaybackRate}
            muted={true}
            style={{ width: '100%', height: '100%' }}
          />
        </CameraMotion>
        <Caption text="Three AI models generate plans simultaneously." timing="fade" />
      </Sequence>
      
      {/* Beat 2: Review Generated Plans */}
      <Sequence from={beat1Duration} durationInFrames={beat2Duration}>
        <CameraMotion linearZoomRange={[120, 300, 1, 1.1]}>
          <OffthreadVideo
            src={videoSrc}
            trimBefore={beat2Start}
            trimAfter={beat2End}
            playbackRate={beat2PlaybackRate}
            muted={true}
            style={{ width: '100%', height: '100%' }}
          />
        </CameraMotion>
        <Caption text="Review each plan's unique approach and insights." timing="fade" />
      </Sequence>
      
      {/* Beat 3: Merge Plans */}
      <Sequence from={beat1Duration + beat2Duration} durationInFrames={beat3Duration}>
        <CameraMotion panYRange={[0, beat3Duration * 0.7, 0, -80]}>
          <OffthreadVideo
            src={videoSrc}
            trimBefore={beat3Start}
            trimAfter={beat3End}
            playbackRate={beat3PlaybackRate}
            muted={true}
            style={{ width: '100%', height: '100%' }}
          />
        </CameraMotion>
        <Caption text="AI architect synthesizes all plans into one superior strategy." timing="fade" />
      </Sequence>
      
      {/* Beat 4: Final Merged Plan */}
      <Sequence from={beat1Duration + beat2Duration + beat3Duration} durationInFrames={beat4Duration}>
        <CameraMotion linearZoomRange={[90, 360, 1, 1.15]}>
          <OffthreadVideo
            src={videoSrc}
            trimBefore={beat4Start}
            trimAfter={beat4End}
            playbackRate={beat4PlaybackRate}
            muted={true}
            style={{ width: '100%', height: '100%' }}
          />
        </CameraMotion>
        <Caption text="Complete implementation plan ready for execution." timing="fade" />
      </Sequence>
      
      <Watermark />
    </>
  );
};