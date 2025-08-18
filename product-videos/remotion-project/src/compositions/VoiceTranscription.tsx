import React from 'react';
import { AbsoluteFill, Sequence, OffthreadVideo, useVideoConfig, staticFile, interpolate, useCurrentFrame } from 'remotion';
import { CameraMotion, Caption, Watermark, AudioWaveform, TranscribedTextCard } from '../components';
import { SOURCES } from '../config/sources';
import { timestampToFrames } from '../utils/time';
import { colors } from '../config/brand';

export const VoiceTranscription: React.FC = () => {
  const { fps } = useVideoConfig();
  const videoSrc = staticFile(SOURCES.screen_master);

  // Beat timing configuration
  const beats = [
    {
      sourceStart: timestampToFrames('14:53:00', fps),
      sourceEnd: timestampToFrames('14:55:00', fps),
      duration: 120, // 2s at 60fps
      sequenceStart: 0
    },
    {
      sourceStart: timestampToFrames('14:55:00', fps),
      sourceEnd: timestampToFrames('15:02:00', fps),
      duration: 420, // 7s at 60fps
      sequenceStart: 120
    },
    {
      sourceStart: timestampToFrames('15:02:00', fps),
      sourceEnd: timestampToFrames('15:06:00', fps),
      duration: 240, // 4s at 60fps
      sequenceStart: 540
    },
    {
      sourceStart: timestampToFrames('15:06:00', fps),
      sourceEnd: timestampToFrames('15:10:00', fps),
      duration: 300, // 5s at 60fps
      sequenceStart: 780
    }
  ];

  return (
    <AbsoluteFill>
      {/* Beat 1: Tired of typing? */}
      <Sequence from={beats[0].sequenceStart} durationInFrames={beats[0].duration}>
        <CameraMotion linearZoomRange={[0, beats[0].duration, 1, 1.02]}>
          <OffthreadVideo
            src={videoSrc}
            trimBefore={beats[0].sourceStart}
            trimAfter={beats[0].sourceEnd}
            muted={true}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </CameraMotion>
        <Caption 
          text="Tired of typing?" 
          appearFromFrame={0} 
          disappearAtFrame={110} 
        />
      </Sequence>

      {/* Beat 2: AudioWaveform overlay */}
      <Sequence from={beats[1].sequenceStart} durationInFrames={beats[1].duration}>
        <OffthreadVideo
          src={videoSrc}
          trimBefore={beats[1].sourceStart}
          trimAfter={beats[1].sourceEnd}
          muted={true}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <AudioWaveform active={true} align="bottom" />
      </Sequence>

      {/* Beat 3: Processing pill with pulse animation */}
      <Sequence from={beats[2].sequenceStart} durationInFrames={beats[2].duration}>
        <OffthreadVideo
          src={videoSrc}
          trimBefore={beats[2].sourceStart}
          trimAfter={beats[2].sourceEnd}
          muted={true}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <ProcessingPill />
      </Sequence>

      {/* Beat 4: Just talk. It's captured. */}
      <Sequence from={beats[3].sequenceStart} durationInFrames={beats[3].duration}>
        <CameraMotion linearZoomRange={[0, beats[3].duration, 1, 1.05]}>
          <OffthreadVideo
            src={videoSrc}
            trimBefore={beats[3].sourceStart}
            trimAfter={beats[3].sourceEnd}
            muted={true}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </CameraMotion>
        <Caption 
          text="Dictate ideas. We transcribe and structure them."
          appearFromFrame={0}
          disappearAtFrame={120}
        />
        <TranscribedTextCard 
          text="Please be sure to utilize the best tailwind practices."
          appearFromFrame={30}
          disappearAtFrame={270}
        />
      </Sequence>

      {/* Watermark throughout */}
      <Watermark />
    </AbsoluteFill>
  );
};

// Processing pill component with pulse animation
const ProcessingPill: React.FC = () => {
  const frame = useCurrentFrame();
  
  const scale = interpolate(
    frame % 60, // Pulse every second at 60fps
    [0, 30, 60],
    [1, 1.1, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  const opacity = interpolate(
    frame % 60,
    [0, 30, 60],
    [0.8, 1, 0.8],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) scale(${scale})`,
        background: `linear-gradient(135deg, ${colors.tealLight}, ${colors.tealMedium})`,
        color: 'white',
        padding: '14px 28px',
        borderRadius: '28px',
        fontSize: '24px',
        fontWeight: '600',
        opacity,
        boxShadow: `0 8px 24px ${colors.tealLight.replace(')', ' / 0.3)')}`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${colors.glassBorder}`,
        textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
      }}
    >
      Processing...
    </div>
  );
};