import React from 'react';
import { Sequence, staticFile, useVideoConfig, OffthreadVideo } from 'remotion';
import { SOURCES } from '../config/sources';
import { timestampToFrames, framesBetween, playbackRateFor, accumulateStarts } from '../utils/time';
import { Watermark } from '../components/Watermark';
import { CameraMotion } from '../components/CameraMotion';
import { Caption } from '../components/Caption';

export const DeepResearch: React.FC = () => {
  const { fps } = useVideoConfig();
  const videoSrc = staticFile(SOURCES.screen_deep_research);

  const beats = [
    { in: '00:38:00', out: '00:40:00', caption: 'Automated prompt generation.' },
    { in: '00:40:00', out: '00:53:00', caption: 'Model, usage, and prompts in one place.' },
    { in: '00:55:00', out: '01:40:00', caption: 'Actionable findings with code and links.' },
    { in: '01:55:00', out: '02:05:00', caption: 'Ready to act.' }
  ];

  // Target frames for ~19 second runtime (totalTargetFrames = 1140)
  const targetFramesList = [120, 300, 480, 240];
  const sourceFramesList = beats.map(beat => framesBetween(beat.in, beat.out, fps));

  const sequenceStarts = accumulateStarts(targetFramesList);

  return (
    <>
      <Watermark />
      {beats.map((beat, index) => {
        const startFrame = timestampToFrames(beat.in, fps);
        const sourceFrames = sourceFramesList[index];
        const targetFrames = targetFramesList[index];
        const playbackRate = playbackRateFor(sourceFrames, targetFrames);

        const endFrame = timestampToFrames(beat.out, fps);
        
        return (
          <Sequence key={index} from={sequenceStarts[index]} durationInFrames={targetFrames}>
            <CameraMotion 
              linearZoomRange={index === 3 ? [0, 60, 1, 1.05] : undefined}
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
            <Caption 
              text={beat.caption} 
              timing="fade"
              fadeInDuration={15}
              fadeOutDuration={15}
            />
          </Sequence>
        );
      })}
    </>
  );
};