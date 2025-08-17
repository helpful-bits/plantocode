import { AbsoluteFill, Sequence, OffthreadVideo, useCurrentFrame, staticFile } from "remotion";
import React from "react";

interface SpeedRampTemplateProps {
  videoFile: string;
  startTime: number;  // in seconds
  endTime: number;    // in seconds
  speedUpStart: number; // when to start speeding up (in seconds from startTime)
  speedUpEnd: number;   // when to stop speeding up (in seconds from startTime)
  speedMultiplier: number; // e.g., 10 for 10x speed
  titleText?: string;
  titleDuration?: number; // in seconds
  speedIndicatorText?: string;
}

/**
 * Template for creating videos with speed ramping effects
 * Perfect for demonstrations where you want to speed up repetitive parts
 */
export const SpeedRampTemplate: React.FC<SpeedRampTemplateProps> = ({
  videoFile,
  startTime,
  endTime,
  speedUpStart,
  speedUpEnd,
  speedMultiplier,
  titleText,
  titleDuration = 5,
  speedIndicatorText = `${speedMultiplier}X`,
}) => {
  const frame = useCurrentFrame();
  const fps = 30; // Default FPS
  const videoSrc = staticFile(videoFile);
  
  // Calculate frame positions
  const startFrame = startTime * fps;
  const speedUpStartFrame = speedUpStart * fps;
  const speedUpEndFrame = speedUpEnd * fps;
  const endFrame = endTime * fps;
  
  // Calculate durations
  const beforeSpeedDuration = speedUpStart;
  const speedUpDuration = speedUpEnd - speedUpStart;
  const afterSpeedDuration = endTime - speedUpEnd;
  
  // Calculate compressed duration for sped-up section
  const compressedSpeedDuration = speedUpDuration / speedMultiplier;
  
  // Calculate sequence frame positions
  const seq1Duration = beforeSpeedDuration * fps;
  const seq2Duration = compressedSpeedDuration * fps;
  const seq3Duration = afterSpeedDuration * fps;
  
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* Section before speed-up */}
      <Sequence from={0} durationInFrames={seq1Duration}>
        <OffthreadVideo 
          src={videoSrc}
          trimBefore={startFrame}
          trimAfter={speedUpStartFrame - startFrame}
          muted={true}
        />
      </Sequence>
      
      {/* Speed-up section */}
      <Sequence from={seq1Duration} durationInFrames={seq2Duration}>
        <OffthreadVideo 
          src={videoSrc}
          trimBefore={speedUpStartFrame}
          trimAfter={speedUpEndFrame - speedUpStartFrame}
          playbackRate={speedMultiplier}
          muted={true}
        />
      </Sequence>
      
      {/* Section after speed-up */}
      {afterSpeedDuration > 0 && (
        <Sequence from={seq1Duration + seq2Duration} durationInFrames={seq3Duration}>
          <OffthreadVideo 
            src={videoSrc}
            trimBefore={speedUpEndFrame}
            trimAfter={endFrame - speedUpEndFrame}
            muted={true}
          />
        </Sequence>
      )}
      
      {/* Title overlay */}
      {titleText && (
        <Sequence from={0} durationInFrames={titleDuration * fps}>
          <AbsoluteFill style={{
            justifyContent: 'flex-end',
            alignItems: 'center',
            paddingBottom: 120
          }}>
            <div style={{
              background: 'rgba(0, 0, 0, 0.8)',
              color: 'white',
              padding: '20px 60px',
              fontSize: 42,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              borderRadius: 10,
              fontWeight: 600
            }}>
              {titleText}
            </div>
          </AbsoluteFill>
        </Sequence>
      )}
      
      {/* Speed indicator */}
      <Sequence from={titleDuration * fps}>
        <AbsoluteFill style={{
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.95)',
            padding: '25px 50px',
            fontSize: 56,
            fontWeight: 'bold',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            borderRadius: 15,
            color: 'black',
            opacity: Math.floor(frame / 30) % 2 === 0 ? 1 : 0,
            display: 'flex',
            alignItems: 'center',
            gap: 15,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }}>
            <span style={{ fontSize: 64 }}>▶▶</span>
            <span>{speedIndicatorText}</span>
          </div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};