import React from 'react';
import { Sequence, staticFile, useVideoConfig, OffthreadVideo } from 'remotion';
import { SOURCES } from '../config/sources';
import { timestampToFrames, framesBetween, playbackRateFor, accumulateStarts } from '../utils/time';
import { Caption } from '../components/Caption';
import { Watermark } from '../components/Watermark';
import { CameraMotion } from '../components/CameraMotion';

export const PlanSynthesis: React.FC = () => {
  const { fps } = useVideoConfig();
  const videoSrc = staticFile(SOURCES.screen_master);

  // Metadata-accurate timestamps with compressed idle time
  // Seconds 4-10 need significant speedup - this corresponds to the latter part of Beat 1 and Beat 2
  // Seconds 10-23 also need significant speedup - this is Beat 3
  const beats = [
    {
      startTimestamp: '05:37:00',
      endTimestamp: '06:27:00',
      targetFrames: 240, // Reduced from 720 to 4 seconds at 60fps (significant speedup)
      caption: 'Multiple experts think in parallel.'
    },
    {
      startTimestamp: '06:37:00',
      endTimestamp: '08:07:00',
      targetFrames: 360, // Reduced from 390 to 6 seconds at 60fps (covers seconds 4-10)
      caption: 'Pick the best from each perspective.'
    },
    {
      startTimestamp: '08:08:00',
      endTimestamp: '09:32:00',
      targetFrames: 360, // Reduced from 810 to 6 seconds at 60fps (seconds 10-16, significant speedup)
      caption: 'AI synthesizes them into one plan.'
    },
    {
      startTimestamp: '09:38:00',
      endTimestamp: '09:43:00',
      targetFrames: 150, // ≈ 2.5 seconds at 60fps (seconds 16-18.5)
      caption: 'Final, cohesive plan.',
      isFinalReveal: true
    }
  ];

  // Calculate sourceFrames and playbackRates for each beat
  const beatsWithCalculations = beats.map(beat => {
    const sourceFrames = framesBetween(beat.startTimestamp, beat.endTimestamp, fps);
    const playbackRate = playbackRateFor(sourceFrames, beat.targetFrames);
    
    return {
      ...beat,
      sourceFrames,
      playbackRate,
      duration: beat.targetFrames
    };
  });

  // Calculate sequence start positions using accumulateStarts
  const durations = beatsWithCalculations.map(beat => beat.duration);
  const sequenceStarts = accumulateStarts(durations);

  return (
    <>
      <Watermark />
      {beatsWithCalculations.map((beat, index) => {
        const startFrame = timestampToFrames(beat.startTimestamp, fps);
        const endFrame = timestampToFrames(beat.endTimestamp, fps);
        const sequenceStart = sequenceStarts[index];

        return (
          <Sequence key={index} from={sequenceStart} durationInFrames={beat.duration}>
            {beat.isFinalReveal ? (
              <CameraMotion springZoomRange={[30, 1.15]}>
                <OffthreadVideo
                  src={videoSrc}
                  trimBefore={startFrame}
                  trimAfter={endFrame}
                  playbackRate={beat.playbackRate}
                  muted={true}
                  style={{ width: '100%', height: '100%' }}
                />
              </CameraMotion>
            ) : (
              <OffthreadVideo
                src={videoSrc}
                trimBefore={startFrame}
                trimAfter={endFrame}
                playbackRate={beat.playbackRate}
                muted={true}
                style={{ width: '100%', height: '100%' }}
              />
            )}
            <Caption 
              text={beat.caption}
              appearFromFrame={30}
              disappearAtFrame={beat.duration - 30}
            />
          </Sequence>
        );
      })}
    </>
  );
};