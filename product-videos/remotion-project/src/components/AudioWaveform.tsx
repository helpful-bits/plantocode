import React from 'react';
import { useCurrentFrame } from 'remotion';
import { brand, colors } from '../config/brand';

interface AudioWaveformProps {
  active: boolean;
  bars?: number;
  color?: string;
  height?: number;
  width?: number;
  align?: 'bottom' | 'center';
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  active,
  bars = 7,
  color = colors.tealBright,
  height = 60,
  width = 120,
  align = 'bottom'
}) => {
  const frame = useCurrentFrame();
  
  const barWidth = (width - (bars - 1) * 4) / bars; // 4px gap between bars
  
  const getBarHeight = (index: number): number => {
    if (!active) return 8; // Minimum height when inactive
    
    // Use different phase offsets for organic movement
    const basePhase = frame * 0.3;
    const barPhase = basePhase + (index * 0.8);
    
    // Create variation in frequency and amplitude for each bar
    const freq1 = Math.sin(barPhase * 0.1 + index * 0.5);
    const freq2 = Math.sin(barPhase * 0.15 + index * 0.3) * 0.7;
    const freq3 = Math.sin(barPhase * 0.08 + index * 0.9) * 0.4;
    
    const combined = (freq1 + freq2 + freq3) / 2.1;
    const normalized = (combined + 1) / 2; // Normalize to 0-1
    
    return Math.max(8, normalized * height);
  };
  
  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    width: `${width}px`,
    height: `${height}px`,
    display: 'flex',
    alignItems: align === 'bottom' ? 'flex-end' : 'center',
    justifyContent: 'center',
    gap: '4px',
    ...(align === 'bottom' ? {
      bottom: brand.safeArea,
      left: '50%',
      transform: 'translateX(-50%)'
    } : {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)'
    })
  };
  
  return (
    <div style={containerStyle}>
      {Array.from({ length: bars }, (_, index) => {
        const barHeight = getBarHeight(index);
        
        return (
          <div
            key={index}
            style={{
              width: `${barWidth}px`,
              height: `${barHeight}px`,
              backgroundColor: color,
              borderRadius: `${barWidth / 2}px`,
              transition: active ? 'none' : 'height 0.3s ease',
              boxShadow: active ? `0 0 8px ${color}40` : 'none', // Subtle glow effect
              filter: active ? `drop-shadow(0 0 4px ${color}60)` : 'none'
            }}
          />
        );
      })}
    </div>
  );
};