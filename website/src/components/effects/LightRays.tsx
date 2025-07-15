'use client';

import { useEffect, useRef } from 'react';

interface LightRaysProps {
  className?: string;
}

export function LightRays({ className = '' }: LightRaysProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Light ray configuration
    const rays: Array<{
      x: number;
      y: number;
      angle: number;
      length: number;
      width: number;
      speed: number;
      opacity: number;
      color: string;
    }> = [];

    // Create rays
    const numRays = 5;
    for (let i = 0; i < numRays; i++) {
      rays.push({
        x: Math.random() * canvas.width,
        y: -100,
        angle: Math.PI / 2 + (Math.random() - 0.5) * 0.3, // Mostly downward
        length: 600 + Math.random() * 400,
        width: 2 + Math.random() * 4,
        speed: 0.5 + Math.random() * 0.5,
        opacity: 0.1 + Math.random() * 0.2,
        color: i % 2 === 0 ? 'oklch(0.65 0.08 195)' : 'oklch(0.52 0.09 195)', // Teal colors
      });
    }

    let animationId: number;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      rays.forEach((ray) => {
        // Update position
        ray.y += ray.speed;
        ray.x += Math.sin(ray.angle) * ray.speed * 0.3;

        // Reset ray when it goes off screen
        if (ray.y > canvas.height + ray.length) {
          ray.y = -ray.length;
          ray.x = Math.random() * canvas.width;
          ray.opacity = 0.1 + Math.random() * 0.2;
        }

        // Draw ray
        ctx.save();
        ctx.globalAlpha = ray.opacity;
        ctx.strokeStyle = ray.color;
        ctx.lineWidth = ray.width;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 20;
        ctx.shadowColor = ray.color;

        // Create gradient for ray
        const gradient = ctx.createLinearGradient(
          ray.x,
          ray.y,
          ray.x + Math.sin(ray.angle) * ray.length,
          ray.y + Math.cos(ray.angle) * ray.length
        );
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(0.1, ray.color);
        gradient.addColorStop(0.9, ray.color);
        gradient.addColorStop(1, 'transparent');
        ctx.strokeStyle = gradient;

        ctx.beginPath();
        ctx.moveTo(ray.x, ray.y);
        ctx.lineTo(
          ray.x + Math.sin(ray.angle) * ray.length,
          ray.y + Math.cos(ray.angle) * ray.length
        );
        ctx.stroke();
        ctx.restore();
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none ${className}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
      }}
    />
  );
}