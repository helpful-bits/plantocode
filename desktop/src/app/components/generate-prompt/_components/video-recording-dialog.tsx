import React, { useState, useEffect } from 'react';
import { Button } from '@/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/ui/dialog';
import { Textarea } from '@/ui/textarea';
import { Label } from '@/ui/label';
import { Checkbox } from '@/ui/checkbox';
import { Slider } from '@/ui/slider';
import { AudioDeviceSelect } from '@/ui';
import { Alert, AlertTitle, AlertDescription } from '@/ui/alert';
import { useTaskContext } from '../_contexts/task-context';
import { useMediaDeviceSettings } from '@/hooks/useMediaDeviceSettings';
import { usePlausible } from '@/hooks/use-plausible';

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
  
  // Initialize local prompt from context when dialog opens
  useEffect(() => {
    if (isOpen) {
      setLocalPrompt(taskState.videoAnalysisPrompt || '');
    }
  }, [isOpen, taskState.videoAnalysisPrompt]);
  
  // Save prompt when closing the dialog
  const handleClose = () => {
    // Save the prompt if it has changed
    if (localPrompt.trim() !== taskState.videoAnalysisPrompt) {
      taskActions.setVideoAnalysisPrompt(localPrompt.trim());
    }
    onClose();
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Record Screen for Analysis</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Optionally enter a prompt describing what you want to analyze in the recording.
            After clicking "Start Recording", select the area of your screen to record.
          </DialogDescription>
        </DialogHeader>
        
        <Alert variant="warning" className="mt-4">
          <AlertTitle>Video Recording Limits</AlertTitle>
          <AlertDescription>
            <strong>Keep recordings under 2 minutes.</strong> The AI model analyzes each frame individually. 
            Longer videos or high frame rates will exceed token limits and may fail processing. 
            Lower frame rates (1-5 FPS) are recommended for longer recordings.
          </AlertDescription>
        </Alert>
        
        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="prompt">Analysis Prompt (Optional)</Label>
            <Textarea
              id="prompt"
              placeholder="e.g., Analyze the user interface and suggest improvements..."
              value={localPrompt}
              onChange={handlePromptChange}
              onBlur={() => {
                if (localPrompt.trim() !== taskState.videoAnalysisPrompt) {
                  taskActions.setVideoAnalysisPrompt(localPrompt.trim());
                }
              }}
              className="min-h-[150px] resize-none"
              autoFocus
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
              <Label htmlFor="frame-rate">Frame Rate (FPS)</Label>
              <span className="text-sm font-mono text-muted-foreground">{selectedFrameRate} FPS</span>
            </div>
            <Slider
              id="frame-rate"
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
            <Button 
              onClick={handleStart}
            >
              Start Recording
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};