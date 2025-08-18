import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

interface CameraMotionProps {
  children: React.ReactNode;
  linearZoomRange?: [number, number, number, number]; // [startFrame, endFrame, startScale, endScale]
  springZoomRange?: [number, number]; // [startFrame, targetScale]
  panXRange?: [number, number, number, number]; // [startFrame, endFrame, startX, endX]
  panYRange?: [number, number, number, number]; // [startFrame, endFrame, startY, endY]
  enableSpringAfterFrame?: number;
}

export const CameraMotion: React.FC<CameraMotionProps> = ({
  children,
  linearZoomRange,
  springZoomRange,
  panXRange,
  panYRange,
  enableSpringAfterFrame
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let scale = 1;
  let translateX = 0;
  let translateY = 0;

  // Linear zoom
  if (linearZoomRange) {
    const [startFrame, endFrame, startScale, endScale] = linearZoomRange;
    if (frame >= startFrame && frame <= endFrame) {
      scale = interpolate(frame, [startFrame, endFrame], [startScale, endScale]);
    }
  }

  // Spring zoom
  if (springZoomRange && frame >= springZoomRange[0]) {
    scale = spring({
      frame: frame - springZoomRange[0],
      fps,
      config: {
        damping: 100,
        stiffness: 200,
        mass: 1
      },
      from: 1,
      to: springZoomRange[1]
    });
  }

  // Pan X
  if (panXRange) {
    const [startFrame, endFrame, startX, endX] = panXRange;
    if (frame >= startFrame && frame <= endFrame) {
      translateX = interpolate(frame, [startFrame, endFrame], [startX, endX]);
    }
  }

  // Pan Y
  if (panYRange) {
    const [startFrame, endFrame, startY, endY] = panYRange;
    if (frame >= startFrame && frame <= endFrame) {
      translateY = interpolate(frame, [startFrame, endFrame], [startY, endY]);
    }
  }

  // Spring motion after specific frame
  if (enableSpringAfterFrame && frame >= enableSpringAfterFrame) {
    const springValue = spring({
      frame: frame - enableSpringAfterFrame,
      fps,
      config: {
        damping: 80,
        stiffness: 150,
        mass: 0.8
      }
    });
    scale *= (1 + springValue * 0.1);
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        transformOrigin: 'center',
        transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`
      }}
    >
      {children}
    </div>
  );
};