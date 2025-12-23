import React, { useState, useEffect } from 'react';
import { Button } from '@/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/ui/dialog';
import { Textarea } from '@/ui/textarea';
import { Label } from '@/ui/label';
import { Checkbox } from '@/ui/checkbox';
import { Slider } from '@/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/tabs';
import { AudioDeviceSelect } from '@/ui';
import { Alert, AlertTitle, AlertDescription } from '@/ui/alert';
import { useTaskContext } from '../_contexts/task-context';
import { useMediaDeviceSettings } from '@/hooks/useMediaDeviceSettings';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { VideoIcon, UploadIcon, FileVideoIcon, AlertCircle } from 'lucide-react';
import { startVideoAnalysisJob } from '@/actions/video-analysis/start-video-analysis.action';
import { useSessionStateContext } from '@/contexts/session';
import { useNotification } from '@/contexts/notification-context';

interface VideoRecordingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (options: { prompt: string; recordAudio: boolean; audioDeviceId: string; frameRate: number }) => void;
}

export const VideoRecordingDialog: React.FC<VideoRecordingDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const { state: taskState, actions: taskActions } = useTaskContext();
  const { activeSessionId, currentSession } = useSessionStateContext();
  const { showNotification } = useNotification();
  const {
    selectedAudioInputId,
    selectAudioInput,
    selectedFrameRate,
    updateSelectedFrameRate,
    videoMinFps,
    videoMaxFps,
    videoStepFps,
  } = useMediaDeviceSettings();

  const [localPrompt, setLocalPrompt] = useState('');
  const [recordAudio, setRecordAudio] = useState(true);
  const [mode, setMode] = useState<'record' | 'browse'>('record');
  const [selectedFile, setSelectedFile] = useState<{ path: string; name: string; duration?: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoMetadata, setVideoMetadata] = useState<{ durationMs: number; size: number } | null>(null);
  const [ffmpegStatus, setFfmpegStatus] = useState<{ available: boolean; message?: string } | null>(null);

  // Track previous isOpen state to detect when dialog opens
  const prevIsOpenRef = React.useRef(false);

  // Initialize local prompt from context when dialog opens (not when context changes)
  useEffect(() => {
    // Only initialize when dialog transitions from closed to open
    if (isOpen && !prevIsOpenRef.current) {
      setLocalPrompt(taskState.videoAnalysisPrompt || '');
      setSelectedFile(null);
      setVideoMetadata(null);
      setMode('record');
      setIsProcessing(false);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, taskState.videoAnalysisPrompt]);

  // Check FFmpeg availability when dialog opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await invoke<{ available: boolean; message?: string }>("check_ffmpeg_available_command");
        if (!cancelled) setFfmpegStatus(res);
      } catch (error) {
        if (!cancelled) {
          setFfmpegStatus({ available: false, message: 'Failed to check FFmpeg availability' });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  // Save prompt when closing the dialog
  const handleClose = () => {
    // Save the prompt if it has changed
    if (localPrompt.trim() !== taskState.videoAnalysisPrompt) {
      taskActions.setVideoAnalysisPrompt(localPrompt.trim());
    }
    setSelectedFile(null);
    setVideoMetadata(null);
    setIsProcessing(false);
    onClose();
  };

  /**
   * Get video duration using browser's HTML5 Video element.
   * This is a fallback when FFmpeg-based probing fails.
   * Works by creating a temporary video element and reading metadata.
   */
  const getVideoDurationFromBrowser = async (filePath: string): Promise<number | null> => {
    try {
      // Read file as binary via Tauri
      const fileContent = await invoke<number[]>('read_binary_file_command', { path: filePath });
      const uint8Array = new Uint8Array(fileContent);

      // Determine MIME type from extension
      const ext = filePath.split('.').pop()?.toLowerCase() || '';
      const mimeTypes: Record<string, string> = {
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
        'mpeg': 'video/mpeg',
        'mpg': 'video/mpeg',
        'wmv': 'video/x-ms-wmv',
        'flv': 'video/x-flv',
        '3gpp': 'video/3gpp',
        'mkv': 'video/x-matroska'
      };
      const mimeType = mimeTypes[ext] || 'video/mp4';

      const blob = new Blob([uint8Array], { type: mimeType });
      const url = URL.createObjectURL(blob);

      return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';

        const cleanup = () => {
          URL.revokeObjectURL(url);
          video.remove();
        };

        video.onloadedmetadata = () => {
          let duration = video.duration;

          // Handle Chromium bug where duration is Infinity
          if (!isFinite(duration)) {
            // Seek to a large time to force duration calculation
            video.currentTime = Number.MAX_SAFE_INTEGER;
            video.onseeked = () => {
              duration = video.duration;
              cleanup();
              resolve(isFinite(duration) ? Math.round(duration * 1000) : null);
            };
            video.onerror = () => {
              cleanup();
              resolve(null);
            };
          } else {
            cleanup();
            resolve(Math.round(duration * 1000)); // Convert to ms
          }
        };

        video.onerror = () => {
          console.error('Browser video element failed to load metadata');
          cleanup();
          resolve(null);
        };

        // Timeout after 10 seconds
        setTimeout(() => {
          cleanup();
          resolve(null);
        }, 10000);

        video.src = url;
      });
    } catch (error) {
      console.error('Failed to get video duration from browser:', error);
      return null;
    }
  };

  // Handle file selection
  const handleBrowseFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Video Files',
          extensions: ['mp4', 'webm', 'mov', 'avi', 'mpeg', 'mpg', 'wmv', 'flv', '3gpp']
        }],
        title: 'Select a video file to analyze'
      });

      if (selected) {
        // Get just the filename from the path
        const filename = selected.split(/[/\\]/).pop() || 'video';
        setSelectedFile({
          path: selected,
          name: filename
        });

        // Probe video metadata - try FFmpeg first, then browser fallback
        let durationMs: number | null = null;
        let size: number = 0;

        // Try FFmpeg-based probing first (more reliable for all formats)
        try {
          const metadata = await invoke<{ durationMs: number; size: number; path: string }>(
            'get_video_metadata_command',
            { path: selected }
          );
          durationMs = metadata.durationMs;
          size = metadata.size;
        } catch (error) {
          console.warn('FFmpeg probe failed, trying browser fallback:', error);
        }

        // If FFmpeg failed or returned invalid duration, try browser-based detection
        if (!durationMs || durationMs <= 0) {
          console.log('Using browser-based video duration detection');
          durationMs = await getVideoDurationFromBrowser(selected);

          // Get file size via Tauri if we don't have it
          if (size === 0) {
            try {
              const stats = await invoke<{ size: number }>('get_file_stats_command', { path: selected });
              size = stats.size;
            } catch {
              // Size is optional, continue without it
            }
          }
        }

        if (durationMs && durationMs > 0) {
          setVideoMetadata({ durationMs, size });
        } else {
          console.error('Could not determine video duration via FFmpeg or browser');
          setVideoMetadata(null);
          showNotification({
            title: 'Warning',
            message: 'Could not determine video duration. You may still try to analyze the video.',
            type: 'warning'
          });
        }
      }
    } catch (error) {
      console.error('Error selecting file:', error);
      showNotification({
        title: 'Error selecting file',
        message: String(error),
        type: 'error'
      });
    }
  };

  // Handle file analysis
  const handleAnalyzeFile = async () => {
    if (!selectedFile || !activeSessionId || !currentSession?.projectDirectory) {
      showNotification({
        title: 'Missing information',
        message: 'Please select a file and ensure you have an active session',
        type: 'warning'
      });
      return;
    }

    // Validate video metadata - duration is required for analysis
    if (!videoMetadata?.durationMs || videoMetadata.durationMs <= 0) {
      showNotification({
        title: 'Unable to analyze video',
        message: 'Could not determine video duration. The file may be corrupted or in an unsupported format. Please try a different video file.',
        type: 'error'
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Get task description and user prompt
      const taskDescription = taskState.taskDescriptionRef.current?.getValue() || '';
      const userPrompt = localPrompt.trim();

      // Combine using XML tags
      let combinedPrompt = '';
      if (taskDescription) {
        combinedPrompt += `<description>\n${taskDescription}\n</description>`;
      }
      if (userPrompt) {
        if (combinedPrompt) combinedPrompt += '\n\n';
        combinedPrompt += `<video_attention_prompt>\n${userPrompt}\n</video_attention_prompt>`;
      }

      // Use validated probed duration (validation above ensures this is valid)
      const durationMs = videoMetadata.durationMs;

      // Start the video analysis job
      const result = await startVideoAnalysisJob({
        sessionId: activeSessionId,
        projectDirectory: currentSession.projectDirectory,
        videoPath: selectedFile.path,
        prompt: combinedPrompt || 'Analyze this video and describe what you see',
        durationMs,
        framerate: selectedFrameRate
      });

      showNotification({
        title: 'Video analysis started',
        message: `Job ${result.jobId} created successfully`,
        type: 'success'
      });

      handleClose();
    } catch (error) {
      console.error('Failed to start video analysis:', error);
      showNotification({
        title: 'Failed to start analysis',
        message: String(error),
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleStart = () => {
    // Get task description and user prompt
    const taskDescription = taskState.taskDescriptionRef.current?.getValue() || '';
    const userPrompt = localPrompt.trim();
    
    // Combine using XML tags
    let combinedPrompt = '';
    if (taskDescription) {
      combinedPrompt += `<description>\n${taskDescription}\n</description>`;
    }
    if (userPrompt) {
      if (combinedPrompt) combinedPrompt += '\n\n';
      combinedPrompt += `<video_attention_prompt>\n${userPrompt}\n</video_attention_prompt>`;
    }
    
    // Call onConfirm with the combined prompt
    onConfirm({ prompt: combinedPrompt, recordAudio, audioDeviceId: selectedAudioInputId, frameRate: selectedFrameRate });
    setRecordAudio(true); // Reset to default
    handleClose();
  };
  
  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newPrompt = e.target.value;
    setLocalPrompt(newPrompt);
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Video Analysis</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Record your screen or select an existing video file for AI analysis.
          </DialogDescription>
        </DialogHeader>

        {ffmpegStatus && !ffmpegStatus.available && (
          <Alert variant="warning" className="mb-2">
            <AlertTitle>FFmpeg required for full video processing</AlertTitle>
            <AlertDescription>
              Long video splitting and robust metadata probing require FFmpeg/ffprobe to be installed.
              {ffmpegStatus.message && <><br />{ffmpegStatus.message}</>}
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'record' | 'browse')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="record" className="flex items-center gap-2">
              <VideoIcon className="h-4 w-4" />
              Record Screen
            </TabsTrigger>
            <TabsTrigger value="browse" className="flex items-center gap-2">
              <UploadIcon className="h-4 w-4" />
              Browse File
            </TabsTrigger>
          </TabsList>

          <TabsContent value="record" className="space-y-4">
            <Alert variant="warning">
              <AlertTitle>Recording Limits</AlertTitle>
              <AlertDescription>
                <strong>Keep recordings under 2 minutes for best results.</strong> The AI model analyzes each frame individually.
                Lower frame rates (1-5 FPS) are recommended for longer recordings.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="prompt-record">Analysis Prompt (Optional)</Label>
                <Textarea
                  id="prompt-record"
                  placeholder="e.g., Analyze the user interface and suggest improvements..."
                  value={localPrompt}
                  onChange={handlePromptChange}
                  onBlur={() => {
                    if (localPrompt.trim() !== taskState.videoAnalysisPrompt) {
                      taskActions.setVideoAnalysisPrompt(localPrompt.trim());
                    }
                  }}
                  className="min-h-[100px] resize-none"
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="record-audio"
                    checked={recordAudio}
                    onCheckedChange={(checked) => setRecordAudio(checked as boolean)}
                  />
                  <Label
                    htmlFor="record-audio"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-foreground"
                  >
                    Include dictation
                  </Label>
                </div>

                {recordAudio && (
                  <div className="flex items-center space-x-2">
                    <Label htmlFor="audio-device" className="text-sm">Audio Device</Label>
                    <AudioDeviceSelect
                      value={selectedAudioInputId}
                      onValueChange={selectAudioInput}
                      disabled={!recordAudio}
                      variant="default"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="frame-rate-record">Frame Rate (FPS)</Label>
                  <span className="text-sm font-mono text-muted-foreground">
                    {selectedFrameRate} FPS
                    {selectedFrameRate < 1 && (
                      <span className="text-xs"> (≈ 1 frame every {(1 / selectedFrameRate).toFixed(1)} seconds)</span>
                    )}
                  </span>
                </div>
                <Slider
                  id="frame-rate-record"
                  value={[selectedFrameRate]}
                  min={videoMinFps}
                  max={videoMaxFps}
                  step={videoStepFps}
                  onValueChange={(value) => updateSelectedFrameRate(value[0])}
                  className="w-full"
                  aria-label="Frame rate"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0.1 FPS</span>
                  <span className="text-center font-medium">Higher frame rates = more frames = more tokens</span>
                  <span>20 FPS</span>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button onClick={handleStart}>
                  Start Recording
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="browse" className="space-y-4">
            <Alert>
              <AlertTitle>Supported Video Formats</AlertTitle>
              <AlertDescription>
                Select a video file from your computer. Supported formats: <strong>MP4, WebM, MOV, AVI, MPEG, MPG, WMV, FLV, 3GPP</strong>.
                Gemini API supports videos up to 2 hours in duration.
              </AlertDescription>
            </Alert>

            {/* File Selection */}
            <div className="space-y-2">
              <Label>Video File</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 justify-start"
                  onClick={handleBrowseFile}
                  disabled={isProcessing}
                >
                  {selectedFile ? (
                    <div className="flex items-center gap-2 truncate">
                      <FileVideoIcon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{selectedFile.name}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <UploadIcon className="h-4 w-4" />
                      <span>Browse for video file...</span>
                    </div>
                  )}
                </Button>
              </div>
            </div>

            {/* Analysis Prompt */}
            <div className="space-y-2">
              <Label htmlFor="prompt-browse">Analysis Prompt (Optional)</Label>
              <Textarea
                id="prompt-browse"
                placeholder="e.g., Analyze the user interface and suggest improvements..."
                value={localPrompt}
                onChange={handlePromptChange}
                onBlur={() => {
                  if (localPrompt.trim() !== taskState.videoAnalysisPrompt) {
                    taskActions.setVideoAnalysisPrompt(localPrompt.trim());
                  }
                }}
                className="min-h-[100px] resize-none"
                disabled={isProcessing}
              />
            </div>

            {/* Frame Rate Control */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="frame-rate-browse">Frame Rate (FPS)</Label>
                <span className="text-sm font-mono text-muted-foreground">
                  {selectedFrameRate} FPS
                  {selectedFrameRate < 1 && (
                    <span className="text-xs"> (≈ 1 frame every {(1 / selectedFrameRate).toFixed(1)} seconds)</span>
                  )}
                </span>
              </div>
              <Slider
                id="frame-rate-browse"
                value={[selectedFrameRate]}
                min={videoMinFps}
                max={videoMaxFps}
                step={videoStepFps}
                onValueChange={(value) => updateSelectedFrameRate(value[0])}
                className="w-full"
                aria-label="Frame rate"
                disabled={isProcessing}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0.1 FPS</span>
                <span className="text-center font-medium">Higher frame rates = more frames = more tokens</span>
                <span>20 FPS</span>
              </div>
            </div>

            {/* Cost Warning for Gemini Pro with long videos */}
            {videoMetadata &&
             videoMetadata.durationMs >= 120000 &&
             currentSession?.modelUsed?.toLowerCase().includes('gemini-2.5-pro') && (
              <Alert variant="warning">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Higher cost on Gemini Pro</AlertTitle>
                <AlertDescription>
                  Long videos (over 2 minutes) may incur higher processing costs with Gemini Pro.
                  Consider Gemini Flash for cost-effective analysis.
                </AlertDescription>
              </Alert>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
                Cancel
              </Button>
              <Button
                onClick={handleAnalyzeFile}
                disabled={!selectedFile || isProcessing}
              >
                {isProcessing ? 'Processing...' : 'Analyze Video'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};