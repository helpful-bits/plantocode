// Ultra-simplified orchestration hooks - zero complexity
'use client';

import { useState, useEffect } from 'react';

// Simple pulse hook
export function usePulse(isActive: boolean, intervalMs: number = 800): boolean {
  const [pulsing, setPulsing] = useState(false);
  
  useEffect(() => {
    if (!isActive) {
      setPulsing(false);
      return;
    }
    
    const interval = setInterval(() => setPulsing(p => !p), intervalMs);
    return () => clearInterval(interval);
  }, [isActive, intervalMs]);
  
  return pulsing;
}

// Simple text display hook  
export function useAutoFillText(targetText: string, isActive: boolean, delay: number = 0): string {
  const [displayText, setDisplayText] = useState('');
  
  useEffect(() => {
    if (!isActive) {
      setDisplayText('');
      return;
    }
    
    let index = 0;
    const interval = setInterval(() => {
      if (index <= targetText.length) {
        setDisplayText(targetText.slice(0, index));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 50);
    
    return () => clearInterval(interval);
  }, [targetText, isActive, delay]);

  return displayText;
}

// Simple number animation
export function useAnimatedNumber(target: number, isActive: boolean): number {
  const [current, setCurrent] = useState(0);
  
  useEffect(() => {
    if (!isActive) {
      setCurrent(0);
      return;
    }
    
    setCurrent(target);
  }, [target, isActive]);
  
  return current;
}

// Simple delayed visibility
export function useDelayedVisibility(isActive: boolean, delay: number = 500): boolean {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isActive) {
      const timer = setTimeout(() => setIsVisible(true), delay);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [isActive, delay]);

  return isVisible;
}

// Simple typing effect
export function useTypeOnScroll(targetText: string, progress: number, startProgress: number = 0.3, speed: number = 50): { displayText: string; isTyping: boolean } {
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (progress < startProgress) {
      setDisplayText('');
      setIsTyping(false);
      return;
    }

    if (progress >= startProgress && displayText.length === 0) {
      setIsTyping(true);
      let index = 0;
      const interval = setInterval(() => {
        if (index <= targetText.length) {
          setDisplayText(targetText.slice(0, index));
          index++;
        } else {
          clearInterval(interval);
          setIsTyping(false);
        }
      }, speed);
      return () => clearInterval(interval);
    }
  }, [progress, startProgress, targetText, speed, displayText.length]);

  return { displayText, isTyping };
}

// Simple simulated click
export function useSimulatedClick(isActive: boolean): { isPressed: boolean; hasClicked: boolean } {
  const [isPressed, setIsPressed] = useState(false);
  const [hasClicked, setHasClicked] = useState(false);

  useEffect(() => {
    if (isActive && !hasClicked) {
      setIsPressed(true);
      setHasClicked(true);
      const timer = setTimeout(() => setIsPressed(false), 200);
      return () => clearTimeout(timer);
    }
    if (!isActive) {
      setHasClicked(false);
      setIsPressed(false);
    }
  }, [isActive, hasClicked]);

  return { isPressed, hasClicked };
}