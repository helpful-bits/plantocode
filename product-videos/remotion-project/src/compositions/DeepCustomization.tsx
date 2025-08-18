import React from 'react';
import { Sequence, staticFile, useVideoConfig, OffthreadVideo } from 'remotion';
import { SOURCES } from '../config/sources';
import { timestampToFrames, framesBetween, playbackRateFor, accumulateStarts } from '../utils/time';
import { Caption } from '../components/Caption';
import { Watermark } from '../components/Watermark';
import { CameraMotion } from '../components/CameraMotion';

export const DeepCustomization: React.FC = () => {
  const { fps } = useVideoConfig();
  const videoSrc = staticFile(SOURCES.screen_master);

  const beats = [
    { 
      in: '15:13:00', 
      out: '15:14:00', 
      target: 120, 
      caption: 'Navigate to Settings. Configure per task.',
      zoomFrom: 1,
      zoomTo: 1.03
    },
    { 
      in: '15:14:00', 
      out: '16:07:00', 
      target: 720, // ~12 seconds total - 2 seconds for beat 1 = 10 seconds for beat 2 (600 frames at 60fps)
      caption: 'Tune prompts and models precisely.',
      zoomFrom: 1,
      zoomTo: 1.12
    }
  ];

  // Calculate actual source frames and playback rates
  const sourceFrames = beats.map(beat => framesBetween(beat.in, beat.out, fps));
  const targetFrames = beats.map(beat => beat.target);
  const playbackRates = sourceFrames.map((source, i) => playbackRateFor(source, targetFrames[i]));
  const sequenceStarts = accumulateStarts(targetFrames);

  return (
    <>
      {beats.map((beat, index) => {
        const startFrame = timestampToFrames(beat.in, fps);
        const endFrame = timestampToFrames(beat.out, fps);
        const zoomConfig: [number, number, number, number] = [
          0, 
          targetFrames[index], 
          beat.zoomFrom, 
          beat.zoomTo
        ];

        return (
          <Sequence key={index} from={sequenceStarts[index]} durationInFrames={targetFrames[index]}>
            <CameraMotion linearZoomRange={zoomConfig}>
              <OffthreadVideo
                src={videoSrc}
                trimBefore={startFrame}
                trimAfter={endFrame}
                muted={true}
                playbackRate={playbackRates[index]}
                style={{ width: '100%', height: '100%' }}
              />
            </CameraMotion>
            <Caption text={beat.caption} />
          </Sequence>
        );
      })}
      <Watermark />
    </>
  );
};