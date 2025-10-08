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
import { usePlausible } from '@/hooks/use-plausible';
import { open } from '@tauri-apps/plugin-dialog';
import { VideoIcon, UploadIcon, FileVideoIcon } from 'lucide-react';
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
  const { trackEvent } = usePlausible();
  const { state: taskState, actions: taskActions } = useTaskContext();
  const { activeSessionId, currentSession } = useSessionStateContext();
  const { showNotification } = useNotification();
  const {
    selectedAudioInputId,
    selectAudioInput,
    selectedFrameRate,
    setSelectedFrameRate,
    minFps,
    maxFps
  } = useMediaDeviceSettings();

  const [localPrompt, setLocalPrompt] = useState('');
  const [recordAudio, setRecordAudio] = useState(true);
  const [mode, setMode] = useState<'record' | 'browse'>('record');
  const [selectedFile, setSelectedFile] = useState<{ path: string; name: string; duration?: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Initialize local prompt from context when dialog opens
  useEffect(() => {
    if (isOpen) {
      setLocalPrompt(taskState.videoAnalysisPrompt || '');
      setSelectedFile(null);
      setMode('record');
      setIsProcessing(false);
    }
  }, [isOpen, taskState.videoAnalysisPrompt]);

  // Save prompt when closing the dialog
  const handleClose = () => {
    // Save the prompt if it has changed
    if (localPrompt.trim() !== taskState.videoAnalysisPrompt) {
      taskActions.setVideoAnalysisPrompt(localPrompt.trim());
    }
    setSelectedFile(null);
    setIsProcessing(false);
    onClose();
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

      // Estimate duration (we'll use a default since we can't easily get it in Tauri)
      // You could enhance this by reading video metadata if needed
      const estimatedDuration = 60000; // Default to 60 seconds

      // Start the video analysis job
      const result = await startVideoAnalysisJob({
        sessionId: activeSessionId,
        projectDirectory: currentSession.projectDirectory,
        videoPath: selectedFile.path,
        prompt: combinedPrompt || 'Analyze this video and describe what you see',
        durationMs: estimatedDuration,
        framerate: selectedFrameRate
      });

      showNotification({
        title: 'Video analysis started',
        message: `Job ${result.jobId} created successfully`,
        type: 'success'
      });

      trackEvent('desktop_video_analysis_file', {
        has_prompt: Boolean(localPrompt.trim()).toString(),
        frame_rate: selectedFrameRate,
        location: 'video_recording_dialog'
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
    // Track video recording start
    trackEvent('desktop_video_recording_started', {
      has_prompt: Boolean(localPrompt.trim()).toString(),
      record_audio: recordAudio.toString(),
      frame_rate: selectedFrameRate,
      location: 'video_recording_dialog'
    });
    
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
                  <span className="text-sm font-mono text-muted-foreground">{selectedFrameRate} FPS</span>
                </div>
                <Slider
                  id="frame-rate-record"
                  value={[selectedFrameRate]}
                  min={minFps}
                  max={maxFps}
                  step={1}
                  onValueChange={(value) => setSelectedFrameRate(value[0])}
                  className="w-full"
                  aria-label="Frame rate"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{minFps} FPS</span>
                  <span className="text-center font-medium">Higher frame rates = more frames = more tokens</span>
                  <span>{maxFps} FPS</span>
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
                <span className="text-sm font-mono text-muted-foreground">{selectedFrameRate} FPS</span>
              </div>
              <Slider
                id="frame-rate-browse"
                value={[selectedFrameRate]}
                min={minFps}
                max={maxFps}
                step={1}
                onValueChange={(value) => setSelectedFrameRate(value[0])}
                className="w-full"
                aria-label="Frame rate"
                disabled={isProcessing}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{minFps} FPS</span>
                <span className="text-center font-medium">Higher frame rates = more frames = more tokens</span>
                <span>{maxFps} FPS</span>
              </div>
            </div>

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