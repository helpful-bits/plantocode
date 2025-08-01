import React, { useState, useEffect } from 'react';
import { Button } from '@/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/ui/dialog';
import { Textarea } from '@/ui/textarea';
import { Label } from '@/ui/label';
import { Checkbox } from '@/ui/checkbox';
import { Slider } from '@/ui/slider';
import { AudioDeviceSelect } from '@/ui';
import { useTaskContext } from '../_contexts/task-context';
import { useVideoRecordingSettings } from '@/hooks/useVideoRecordingSettings';

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
  const { 
    selectedAudioInputId, 
    setSelectedAudioInputId, 
    selectedFrameRate, 
    setSelectedFrameRate, 
    minFps,
    maxFps
  } = useVideoRecordingSettings();
  
  const [localPrompt, setLocalPrompt] = useState('');
  const [recordAudio, setRecordAudio] = useState(true);
  
  // Initialize local prompt from context when dialog opens
  useEffect(() => {
    if (isOpen) {
      setLocalPrompt(taskState.videoAnalysisPrompt || '');
    }
  }, [isOpen, taskState.videoAnalysisPrompt]);
  
  const handleStart = () => {
    // Save the prompt to task context only
    const promptToUse = localPrompt.trim();
    taskActions.setVideoAnalysisPrompt(promptToUse);
    
    // Call onConfirm with an object
    onConfirm({ prompt: promptToUse, recordAudio, audioDeviceId: selectedAudioInputId, frameRate: selectedFrameRate });
    setRecordAudio(true); // Reset to default
    onClose();
  };
  
  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newPrompt = e.target.value;
    setLocalPrompt(newPrompt);
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Record Screen for Analysis</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Optionally enter a prompt describing what you want to analyze in the recording.
            After clicking "Start Recording", select the area of your screen to record.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="prompt">Analysis Prompt (Optional)</Label>
            <Textarea
              id="prompt"
              placeholder="e.g., Analyze the user interface and suggest improvements..."
              value={localPrompt}
              onChange={handlePromptChange}
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
                  onValueChange={setSelectedAudioInputId}
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
              <span className="text-center">Higher frame rates may increase analysis costs</span>
              <span>{maxFps} FPS</span>
            </div>
          </div>
          
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
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