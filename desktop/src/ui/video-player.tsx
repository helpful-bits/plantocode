"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/utils/utils";
import { Slider } from "./slider";
import { Button } from "./button";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

interface VideoPlayerProps {
  src: string;
  className?: string;
  maxHeight?: string;
  poster?: string;
}

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function VideoPlayer({
  src,
  className,
  maxHeight = "500px",
  poster,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Format time as MM:SS or HH:MM:SS
  const formatTime = useCallback((seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds)) return "00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }, []);

  // Handle play/pause
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, []);

  // Handle seek
  const handleSeek = useCallback((value: number[]) => {
    const video = videoRef.current;
    if (!video || !isFinite(value[0])) return;
    video.currentTime = value[0];
    setCurrentTime(value[0]);
  }, []);

  // Handle volume change
  const handleVolumeChange = useCallback((value: number[]) => {
    const video = videoRef.current;
    if (!video) return;
    const newVolume = value[0];
    video.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isMuted) {
      video.muted = false;
      video.volume = volume || 1;
      setIsMuted(false);
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  // Toggle fullscreen - with webkit fallbacks for Tauri
  const toggleFullscreen = useCallback(async () => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    try {
      // Check current fullscreen state
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (video as any).webkitDisplayingFullscreen
      );

      if (!isCurrentlyFullscreen) {
        // Try to enter fullscreen - prefer video element for webkit
        if ((video as any).webkitEnterFullscreen) {
          // iOS/Safari webkit method on video element
          (video as any).webkitEnterFullscreen();
        } else if ((video as any).webkitRequestFullscreen) {
          (video as any).webkitRequestFullscreen();
        } else if ((container as any).webkitRequestFullscreen) {
          (container as any).webkitRequestFullscreen();
        } else if (container.requestFullscreen) {
          await container.requestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        // Exit fullscreen
        if ((video as any).webkitExitFullscreen) {
          (video as any).webkitExitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        } else if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
  }, []);

  // Change playback speed
  const changePlaybackSpeed = useCallback((speed: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = speed;
    setPlaybackSpeed(speed);
  }, []);

  // Skip forward/backward
  const skip = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
  }, []);

  // Auto-hide controls
  const resetHideControlsTimeout = useCallback(() => {
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    setShowControls(true);
    if (isPlaying) {
      hideControlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying]);

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateDuration = () => {
      if (video.duration && isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration);
        setIsLoaded(true);
      }
    };

    const handleLoadedMetadata = () => {
      updateDuration();
    };

    const handleDurationChange = () => {
      updateDuration();
    };

    const handleCanPlay = () => {
      updateDuration();
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      // Also try to get duration on timeupdate as fallback
      if (duration === 0) {
        updateDuration();
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
      setShowControls(true);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setShowControls(true);
    };

    const handleVolumeChangeEvent = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("volumechange", handleVolumeChangeEvent);

    // If metadata already loaded
    if (video.readyState >= 1) {
      updateDuration();
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("volumechange", handleVolumeChangeEvent);
    };
  }, [src, duration]);

  // Fullscreen change listener - with webkit support
  useEffect(() => {
    const video = videoRef.current;

    const handleFullscreenChange = () => {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (video as any)?.webkitDisplayingFullscreen
      );
      setIsFullscreen(isFs);
    };

    // Listen to video-specific webkit fullscreen events
    const handleWebkitBeginFullscreen = () => setIsFullscreen(true);
    const handleWebkitEndFullscreen = () => setIsFullscreen(false);

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    if (video) {
      video.addEventListener("webkitbeginfullscreen", handleWebkitBeginFullscreen);
      video.addEventListener("webkitendfullscreen", handleWebkitEndFullscreen);
    }

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      if (video) {
        video.removeEventListener("webkitbeginfullscreen", handleWebkitBeginFullscreen);
        video.removeEventListener("webkitendfullscreen", handleWebkitEndFullscreen);
      }
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if this video player is focused or fullscreen
      if (!containerRef.current?.contains(document.activeElement) && !isFullscreen) {
        return;
      }

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          skip(-10);
          break;
        case "ArrowRight":
          e.preventDefault();
          skip(10);
          break;
        case "ArrowUp":
          e.preventDefault();
          handleVolumeChange([Math.min(1, volume + 0.1)]);
          break;
        case "ArrowDown":
          e.preventDefault();
          handleVolumeChange([Math.max(0, volume - 0.1)]);
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, skip, handleVolumeChange, volume, toggleMute, toggleFullscreen, isFullscreen]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative group bg-black rounded-md overflow-hidden",
        isFullscreen && "fixed inset-0 z-50 rounded-none",
        className
      )}
      onMouseMove={resetHideControlsTimeout}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      tabIndex={0}
    >
      {/* Video element - uses Tauri's convertFileSrc URL */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className={cn(
          "w-full cursor-pointer",
          isFullscreen ? "h-full object-contain" : ""
        )}
        style={{ maxHeight: isFullscreen ? "100%" : maxHeight }}
        onClick={togglePlay}
        playsInline
        preload="metadata"
      >
        <p className="text-sm text-muted-foreground p-4">
          Your browser does not support the video tag.
        </p>
      </video>

      {/* Click overlay for play/pause */}
      {!isPlaying && isLoaded && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
          onClick={togglePlay}
        >
          <div className="w-16 h-16 rounded-full bg-primary/90 flex items-center justify-center">
            <Play className="w-8 h-8 text-primary-foreground ml-1" />
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-12 transition-opacity duration-300",
          showControls || !isPlaying ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        {/* Progress bar */}
        <div className="mb-3">
          <Slider
            value={[currentTime]}
            min={0}
            max={duration || 100}
            step={0.1}
            onValueChange={handleSeek}
            className="w-full cursor-pointer [&_[data-radix-slider-track]]:h-1 [&_[data-radix-slider-track]]:bg-white/30 [&_[data-radix-slider-range]]:bg-primary [&_[data-radix-slider-thumb]]:h-3 [&_[data-radix-slider-thumb]]:w-3 [&_[data-radix-slider-thumb]]:opacity-0 group-hover:[&_[data-radix-slider-thumb]]:opacity-100"
          />
        </div>

        {/* Control buttons */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {/* Play/Pause */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={togglePlay}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 ml-0.5" />
              )}
            </Button>

            {/* Skip backward */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={() => skip(-10)}
              title="Rewind 10s"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>

            {/* Skip forward */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={() => skip(10)}
              title="Forward 10s"
            >
              <RotateCw className="h-4 w-4" />
            </Button>

            {/* Volume */}
            <div className="flex items-center gap-1 group/volume">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={toggleMute}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
              <div className="w-0 overflow-hidden group-hover/volume:w-20 transition-all duration-200">
                <Slider
                  value={[isMuted ? 0 : volume]}
                  min={0}
                  max={1}
                  step={0.05}
                  onValueChange={handleVolumeChange}
                  className="w-20 [&_[data-radix-slider-track]]:h-1 [&_[data-radix-slider-track]]:bg-white/30 [&_[data-radix-slider-range]]:bg-white [&_[data-radix-slider-thumb]]:h-3 [&_[data-radix-slider-thumb]]:w-3 [&_[data-radix-slider-thumb]]:bg-white [&_[data-radix-slider-thumb]]:border-0"
                />
              </div>
            </div>

            {/* Time display */}
            <span className="text-white text-xs font-mono ml-2">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Playback speed */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-white hover:bg-white/20 text-xs font-medium"
                >
                  {playbackSpeed}x
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[80px]">
                {PLAYBACK_SPEEDS.map((speed) => (
                  <DropdownMenuItem
                    key={speed}
                    onClick={() => changePlaybackSpeed(speed)}
                    className={cn(
                      "text-xs justify-center",
                      playbackSpeed === speed && "bg-accent"
                    )}
                  >
                    {speed}x
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Fullscreen */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? (
                <Minimize className="h-4 w-4" />
              ) : (
                <Maximize className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
