import React from "react";
import { Sequence, staticFile, useVideoConfig, OffthreadVideo } from "remotion";
import { SOURCES } from '../config/sources';
import { timestampToFrames, framesBetween, playbackRateFor, accumulateStarts } from '../utils/time';
import { Watermark } from '../components/Watermark';
import { Caption } from '../components/Caption';
import { CameraMotion } from '../components/CameraMotion';

export const TaskInputRefinement: React.FC = () => {
  const { fps } = useVideoConfig();
  const videoSrc = staticFile(SOURCES.screen_master);
  
  // Three distinct input methods showcased
  const beatsConfig = [
    {
      label: "Audio Input - Voice Transcription",
      sourceStart: "14:53:00",
      sourceEnd: "15:10:00", // Full voice transcription flow
      targetDuration: 480, // 8 seconds
      caption: "Speak your ideas. AI transcribes and structures them.",
    },
    {
      label: "Inline Task Editing - Select and Refine",
      sourceStart: "06:37:00",
      sourceEnd: "08:07:00", // Full selection and merge process
      targetDuration: 480, // 8 seconds
      caption: "Select, merge, and refine tasks inline.",
    },
    {
      label: "Video Input - Screen Recording",
      sourceStart: "00:05:00", 
      sourceEnd: "02:22:00", // Full recording flow including mobile screen
      targetDuration: 600, // 10 seconds
      caption: "Record your screen. AI analyzes visual issues.",
    },
  ];

  // Calculate frames and playback rates for each beat
  const beats = beatsConfig.map(beat => {
    const sourceFrames = framesBetween(beat.sourceStart, beat.sourceEnd, fps);
    const playbackRate = playbackRateFor(sourceFrames, beat.targetDuration);
    
    return {
      ...beat,
      sourceStart: timestampToFrames(beat.sourceStart, fps),
      sourceEnd: timestampToFrames(beat.sourceEnd, fps),
      sourceFrames,
      playbackRate,
      durationInFrames: beat.targetDuration,
    };
  });

  // Calculate accumulated start positions
  const durations = beats.map(beat => beat.durationInFrames);
  const starts = accumulateStarts(durations);

  return (
    <>
      <Watermark />
      
      {/* Beat 1: Audio Input */}
      <Sequence from={starts[0]} durationInFrames={beats[0].durationInFrames}>
        <CameraMotion springZoomRange={[60, 1.08]}>
          <OffthreadVideo
            src={videoSrc}
            trimBefore={beats[0].sourceStart}
            trimAfter={beats[0].sourceEnd}
            playbackRate={beats[0].playbackRate}
            muted={true}
            style={{ width: "100%", height: "100%" }}
          />
        </CameraMotion>
        <Caption 
          text={beats[0].caption}
          appearFromFrame={30}
          disappearAtFrame={beats[0].durationInFrames - 30}
        />
      </Sequence>

      {/* Beat 2: Inline Task Editing */}
      <Sequence from={starts[1]} durationInFrames={beats[1].durationInFrames}>
        <CameraMotion panYRange={[0, beats[1].durationInFrames * 0.7, 0, -50]}>
          <OffthreadVideo
            src={videoSrc}
            trimBefore={beats[1].sourceStart}
            trimAfter={beats[1].sourceEnd}
            playbackRate={beats[1].playbackRate}
            muted={true}
            style={{ width: "100%", height: "100%" }}
          />
        </CameraMotion>
        <Caption 
          text={beats[1].caption}
          appearFromFrame={30}
          disappearAtFrame={beats[1].durationInFrames - 30}
        />
      </Sequence>

      {/* Beat 3: Video Input - Screen Recording */}
      <Sequence from={starts[2]} durationInFrames={beats[2].durationInFrames}>
        <CameraMotion linearZoomRange={[120, 300, 1, 1.15]}>
          <OffthreadVideo
            src={videoSrc}
            trimBefore={beats[2].sourceStart}
            trimAfter={beats[2].sourceEnd}
            playbackRate={beats[2].playbackRate}
            muted={true}
            style={{ width: "100%", height: "100%" }}
          />
        </CameraMotion>
        <Caption 
          text={beats[2].caption}
          appearFromFrame={30}
          disappearAtFrame={beats[2].durationInFrames - 30}
        />
      </Sequence>
    </>
  );
};