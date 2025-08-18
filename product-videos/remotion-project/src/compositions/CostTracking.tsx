import React from 'react';
import { Sequence, staticFile, useVideoConfig, OffthreadVideo } from 'remotion';
import { SOURCES } from '../config/sources';
import { timestampToFrames, framesBetween, playbackRateFor, accumulateStarts } from '../utils/time';
import { Caption } from '../components/Caption';
import { Watermark } from '../components/Watermark';

export const CostTracking: React.FC = () => {
  const { fps } = useVideoConfig();
  const videoSrc = staticFile(SOURCES.screen_master);

  const beats = [
    { 
      in: '04:10:00', 
      out: '04:11:00', 
      targetFrames: 60, // 1 second
      caption: 'Instant cost visibility.'
    },
    { 
      in: '04:11:00', 
      out: '04:13:00', 
      targetFrames: 150, // 2.5 seconds
      caption: 'Switch between transactions and usage in one view.'
    },
    { 
      in: '04:13:00', 
      out: '04:19:00', 
      targetFrames: 330, // 5.5 seconds
      caption: 'Clear, auditable history.'
    }
  ];

  // Calculate source frames and playback rates for each beat
  const beatsWithCalculations = beats.map(beat => {
    const sourceFrames = framesBetween(beat.in, beat.out, fps);
    const playbackRate = playbackRateFor(sourceFrames, beat.targetFrames);
    return {
      ...beat,
      sourceFrames,
      playbackRate
    };
  });

  // Calculate sequence start frames
  const durations = beatsWithCalculations.map(beat => beat.targetFrames);
  const sequenceStarts = accumulateStarts(durations);

  return (
    <>
      {beatsWithCalculations.map((beat, index) => {
        const startFrame = timestampToFrames(beat.in, fps);
        const endFrame = timestampToFrames(beat.out, fps);
        const sequenceStart = sequenceStarts[index];

        return (
          <Sequence key={index} from={sequenceStart} durationInFrames={beat.targetFrames}>
            <OffthreadVideo
              src={videoSrc}
              trimBefore={startFrame}
              trimAfter={endFrame}
              playbackRate={beat.playbackRate}
              muted={true}
              style={{ width: '100%', height: '100%' }}
            />
            <Caption 
              text={beat.caption} 
              appearFromFrame={Math.max(0, beat.targetFrames - 90)}
              disappearAtFrame={beat.targetFrames - 10}
            />
          </Sequence>
        );
      })}
      <Watermark />
    </>
  );
};