import React from 'react';
import { Sequence, staticFile, useVideoConfig, OffthreadVideo } from 'remotion';
import { SOURCES } from '../config/sources';
import { timestampToFrames, framesBetween, playbackRateFor, accumulateStarts } from '../utils/time';
import { Caption } from '../components/Caption';
import { Watermark } from '../components/Watermark';
import { CameraMotion } from '../components/CameraMotion';

export const FileFinder: React.FC = () => {
  const { fps } = useVideoConfig();
  const videoSrc = staticFile(SOURCES.screen_master);

  const beats = [
    { in: '04:21:00', out: '04:22:00', caption: 'Find relevant files across your repo.' },
    { in: '04:22:00', out: '05:21:00', caption: 'Patterns → Expansion → AI vetting.' },
    { in: '05:21:00', out: '05:30:00', caption: 'Select and apply.' }
  ];

  const totalTargetFrames = 1200;
  // Target frames: ~60, ~960, ~180 for beats 1, 2, 3
  const targetFramesList = [60, 960, 180];
  const sourceFramesList = beats.map(beat => framesBetween(beat.in, beat.out, fps));

  const sequenceStarts = accumulateStarts(targetFramesList);

  return (
    <>
      <Watermark />
      {beats.map((beat, index) => {
        const startFrame = timestampToFrames(beat.in, fps);
        const endFrame = timestampToFrames(beat.out, fps);
        const sourceFrames = sourceFramesList[index];
        const targetFrames = targetFramesList[index];
        const playbackRate = playbackRateFor(sourceFrames, targetFrames);

        return (
          <Sequence key={index} from={sequenceStarts[index]} durationInFrames={targetFrames}>
            <CameraMotion 
              linearZoomRange={index === 2 ? [0, 60, 1, 1.1] : undefined}
              panXRange={index === 1 ? [0, targetFrames * 0.5, 0, -50] : undefined}
            >
              <OffthreadVideo
                src={videoSrc}
                trimBefore={startFrame}
                trimAfter={endFrame}
                playbackRate={playbackRate}
                muted={true}
                style={{ width: '100%', height: '100%' }}
              />
            </CameraMotion>
            <Caption text={beat.caption} timing="fade" />
          </Sequence>
        );
      })}
    </>
  );
};