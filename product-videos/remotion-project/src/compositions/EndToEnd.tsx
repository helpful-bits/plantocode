import React from 'react';
import { Sequence, OffthreadVideo, staticFile, useVideoConfig } from 'remotion';
import { SOURCES } from '../config/sources';
import { timestampToFrames } from '../utils/time';
import { Caption } from '../components/Caption';
import { Watermark } from '../components/Watermark';
import { CameraMotion } from '../components/CameraMotion';
import { CTA } from '../components/CTA';

export const EndToEnd: React.FC = () => {
  const { fps } = useVideoConfig();
  const videoSrc = staticFile(SOURCES.screen_master);

  // Accurate workflow representation
  const totalDuration = 2580; // 43 seconds total (540+360+420+420+720+120)
  const ctaDuration = 120; // Final 2 seconds for CTA

  // Beat 1: "Record your screen" (00:05:00 → 02:18:00 = showing recording setup and mobile screen)
  const beat1Start = timestampToFrames('00:05:00', fps);
  const beat1End = timestampToFrames('02:18:00', fps);
  const beat1SourceFrames = beat1End - beat1Start;
  const beat1Duration = 540; // 9 seconds (playback rate will be ~14.8)
  const beat1PlaybackRate = beat1SourceFrames / beat1Duration;

  // Beat 2: "AI analyzes the recording" (02:22:00 → 03:40:00 = processing and results)
  const beat2Start = timestampToFrames('02:22:00', fps);
  const beat2End = timestampToFrames('03:40:00', fps);
  const beat2SourceFrames = beat2End - beat2Start;
  const beat2Duration = 360; // 6 seconds
  const beat2PlaybackRate = beat2SourceFrames / beat2Duration;

  // Beat 3: "Find relevant files" (04:21:00 → 05:30:00 = file search and selection)
  const beat3Start = timestampToFrames('04:21:00', fps);
  const beat3End = timestampToFrames('05:30:00', fps);
  const beat3SourceFrames = beat3End - beat3Start;
  const beat3Duration = 420; // 7 seconds
  const beat3PlaybackRate = beat3SourceFrames / beat3Duration;

  // Beat 4: "Generate implementation plans" (05:37:00 → 06:37:00 = parallel generation)
  const beat4Start = timestampToFrames('05:37:00', fps);
  const beat4End = timestampToFrames('06:37:00', fps);
  const beat4SourceFrames = beat4End - beat4Start;
  const beat4Duration = 420; // 7 seconds
  const beat4PlaybackRate = beat4SourceFrames / beat4Duration;

  // Beat 5: "Merge into superior plan" (06:37:00 → 09:39:00 = selection, merge, final review)
  const beat5Start = timestampToFrames('06:37:00', fps);
  const beat5End = timestampToFrames('09:39:00', fps);
  const beat5SourceFrames = beat5End - beat5Start;
  const beat5Duration = 720; // 12 seconds (playback rate will be ~15.2)
  const beat5PlaybackRate = beat5SourceFrames / beat5Duration;

  return (
    <>
      {/* Beat 1: "Record your screen" */}
      <Sequence from={0} durationInFrames={beat1Duration}>
        <CameraMotion linearZoomRange={[240, 360, 1, 1.2]}>
          <OffthreadVideo
            src={videoSrc}
            trimBefore={beat1Start}
            trimAfter={beat1End}
            playbackRate={beat1PlaybackRate}
            muted={true}
            style={{ width: '100%', height: '100%' }}
          />
        </CameraMotion>
        <Caption text="Record your screen to capture issues." timing="fade" />
      </Sequence>

      {/* Beat 2: "AI analyzes the recording" */}
      <Sequence from={beat1Duration} durationInFrames={beat2Duration}>
        <CameraMotion panYRange={[0, beat2Duration * 0.7, 0, -80]}>
          <OffthreadVideo
            src={videoSrc}
            trimBefore={beat2Start}
            trimAfter={beat2End}
            playbackRate={beat2PlaybackRate}
            muted={true}
            style={{ width: '100%', height: '100%' }}
          />
        </CameraMotion>
        <Caption text="AI analyzes visual problems instantly." timing="fade" />
      </Sequence>

      {/* Beat 3: "Find relevant files" */}
      <Sequence from={beat1Duration + beat2Duration} durationInFrames={beat3Duration}>
        <CameraMotion linearZoomRange={[60, 180, 1, 1.08]}>
          <OffthreadVideo
            src={videoSrc}
            trimBefore={beat3Start}
            trimAfter={beat3End}
            playbackRate={beat3PlaybackRate}
            muted={true}
            style={{ width: '100%', height: '100%' }}
          />
        </CameraMotion>
        <Caption text="Find every relevant file automatically." timing="fade" />
      </Sequence>

      {/* Beat 4: "Generate implementation plans" */}
      <Sequence from={beat1Duration + beat2Duration + beat3Duration} durationInFrames={beat4Duration}>
        <CameraMotion springZoomRange={[30, 1.05]}>
          <OffthreadVideo
            src={videoSrc}
            trimBefore={beat4Start}
            trimAfter={beat4End}
            playbackRate={beat4PlaybackRate}
            muted={true}
            style={{ width: '100%', height: '100%' }}
          />
        </CameraMotion>
        <Caption text="Multiple AI experts create plans in parallel." timing="fade" />
      </Sequence>

      {/* Beat 5: "Merge into superior plan" */}
      <Sequence from={beat1Duration + beat2Duration + beat3Duration + beat4Duration} durationInFrames={beat5Duration}>
        <CameraMotion linearZoomRange={[120, 300, 1, 1.15]}>
          <OffthreadVideo
            src={videoSrc}
            trimBefore={beat5Start}
            trimAfter={beat5End}
            playbackRate={beat5PlaybackRate}
            muted={true}
            style={{ width: '100%', height: '100%' }}
          />
        </CameraMotion>
        <Caption text="Merge into one superior plan, ready to execute." timing="fade" />
      </Sequence>

      {/* CTA overlay in final ~120 frames */}
      <Sequence from={totalDuration - ctaDuration} durationInFrames={ctaDuration}>
        <CTA text="See How It Works" />
      </Sequence>

      {/* Watermark throughout */}
      <Watermark />
    </>
  );
};