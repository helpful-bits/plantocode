import React from 'react';
import { Sequence, staticFile, useVideoConfig, OffthreadVideo, useCurrentFrame, interpolate } from 'remotion';
import { SOURCES } from '../config/sources';
import { timestampToFrames } from '../utils/time';
import { RedditText } from '../components/RedditText';

export const RedditAd: React.FC = () => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const videoSrc = staticFile(SOURCES.screen_master);
  
  // Reddit specs: 30fps, 15 seconds = 450 frames
  const totalDuration = 450;

  // Beat structure for maximum impact
  const beats = [
    {
      // Hook - The problem statement
      start: 0,
      duration: 90, // 3 seconds
      videoStart: '00:00:00',
      videoEnd: '00:05:00',
      text: 'Ready to stop babysitting',
      subtext: 'your AI coding assistant?',
      highlight: true
    },
    {
      // Problem visualization - Show the mess
      start: 90,
      duration: 90, // 3 seconds
      videoStart: '02:26:00',
      videoEnd: '02:30:00',
      text: 'It hallucinates APIs',
      subtext: 'that don\'t even exist'
    },
    {
      // Solution part 1 - File finder
      start: 180,
      duration: 75, // 2.5 seconds
      videoStart: '04:21:00',
      videoEnd: '04:40:00',
      text: 'Find the RIGHT files',
      subtext: 'automatically'
    },
    {
      // Solution part 2 - Multiple AI models
      start: 255,
      duration: 75, // 2.5 seconds
      videoStart: '05:37:00',
      videoEnd: '05:50:00',
      text: 'Multiple AI experts',
      subtext: 'working in parallel'
    },
    {
      // Result - Clean output
      start: 330,
      duration: 60, // 2 seconds
      videoStart: '09:38:00',
      videoEnd: '09:42:00',
      text: 'Get code that works',
      subtext: 'the first time'
    },
    {
      // CTA
      start: 390,
      duration: 60, // 2 seconds
      videoStart: '09:42:00',
      videoEnd: '09:43:00',
      text: 'VIBE MANAGER',
      subtext: 'Download free for Mac',
      highlight: true
    }
  ];

  return (
    <>
      {/* Background video sequences */}
      {beats.map((beat, index) => (
        <Sequence key={`video-${index}`} from={beat.start} durationInFrames={beat.duration}>
          <OffthreadVideo
            src={videoSrc}
            trimBefore={timestampToFrames(beat.videoStart, fps)}
            trimAfter={timestampToFrames(beat.videoEnd, fps)}
            playbackRate={
              (timestampToFrames(beat.videoEnd, fps) - timestampToFrames(beat.videoStart, fps)) / beat.duration
            }
            muted={true}
            style={{
              width: '100%',
              height: '100%',
              filter: index === 1 ? 'blur(2px) brightness(0.7)' : 'brightness(0.8)',
              transform: index === 5 ? 'scale(1.1)' : 'scale(1)'
            }}
          />
        </Sequence>
      ))}

      {/* Text overlays with strategic timing */}
      {beats.map((beat, index) => (
        <Sequence key={`text-${index}`} from={beat.start} durationInFrames={beat.duration}>
          <RedditText
            text={beat.text}
            subtext={beat.subtext}
            fontSize={index === 5 ? 84 : 72}
            position={index === 5 ? 'center' : index % 2 === 0 ? 'top' : 'bottom'}
            highlight={beat.highlight}
            appearFrom={5}
            disappearAt={beat.duration - 5}
          />
        </Sequence>
      ))}

      {/* Problem indicators */}
      <Sequence from={90} durationInFrames={90}>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '200px',
          opacity: 0.3,
          animation: 'pulse 2s infinite'
        }}>
          ❌
        </div>
      </Sequence>

      {/* Success indicator */}
      <Sequence from={330} durationInFrames={60}>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '200px',
          opacity: 0.3,
          animation: 'pulse 2s infinite'
        }}>
          ✅
        </div>
      </Sequence>

      {/* Logo watermark throughout */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          fontSize: '24px',
          fontWeight: 'bold',
          color: 'white',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          padding: '8px 16px',
          borderRadius: '8px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          zIndex: 200
        }}
      >
        VIBE MANAGER
      </div>

      {/* Progress bar for visual interest */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '6px',
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          zIndex: 300
        }}
      >
        <div
          style={{
            height: '100%',
            backgroundColor: '#FF4500',
            width: `${(frame / totalDuration) * 100}%`,
            transition: 'width 0.1s linear'
          }}
        />
      </div>
    </>
  );
};