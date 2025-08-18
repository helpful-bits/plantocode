import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

interface RedditTextProps {
  text: string;
  fontSize?: number;
  appearFrom?: number;
  disappearAt?: number;
  position?: 'top' | 'center' | 'bottom';
  highlight?: boolean;
  subtext?: string;
}

export const RedditText: React.FC<RedditTextProps> = ({
  text,
  fontSize = 72,
  appearFrom = 0,
  disappearAt = 999999,
  position = 'center',
  highlight = false,
  subtext
}) => {
  const frame = useCurrentFrame();
  
  const opacity = interpolate(
    frame,
    [appearFrom, appearFrom + 6, disappearAt - 6, disappearAt],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const scale = interpolate(
    frame,
    [appearFrom, appearFrom + 8],
    [0.9, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const positionStyles = {
    top: { top: '10%' },
    center: { top: '50%', transform: `translateY(-50%) scale(${scale})` },
    bottom: { bottom: '10%' }
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        ...positionStyles[position],
        opacity,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        zIndex: 100,
        pointerEvents: 'none'
      }}
    >
      <div
        style={{
          backgroundColor: highlight ? '#FF4500' : 'rgba(0, 0, 0, 0.85)',
          padding: '20px 40px',
          borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
          border: highlight ? '3px solid #FFFFFF' : 'none',
          maxWidth: '90%'
        }}
      >
        <h1
          style={{
            fontSize: `${fontSize}px`,
            fontWeight: 900,
            color: '#FFFFFF',
            textAlign: 'center',
            margin: 0,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            lineHeight: 1.2,
            textShadow: '0 2px 10px rgba(0, 0, 0, 0.3)'
          }}
        >
          {text}
        </h1>
        {subtext && (
          <p
            style={{
              fontSize: `${fontSize * 0.5}px`,
              fontWeight: 600,
              color: '#FFFFFF',
              textAlign: 'center',
              margin: '10px 0 0 0',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              opacity: 0.9
            }}
          >
            {subtext}
          </p>
        )}
      </div>
    </div>
  );
};