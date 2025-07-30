import React, { useState, useEffect } from 'react';
import { Button } from '@/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/ui/dialog';
import { Textarea } from '@/ui/textarea';
import { Label } from '@/ui/label';
import { Checkbox } from '@/ui/checkbox';
import { useTaskContext } from '../_contexts/task-context';
import { useSessionActionsContext } from '@/contexts/session';

interface VideoRecordingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onStartRecording: (prompt: string, recordAudio: boolean) => void;
}

export const VideoRecordingDialog: React.FC<VideoRecordingDialogProps> = ({
  isOpen,
  onClose,
  onStartRecording,
}) => {
  const { state: taskState, actions: taskActions } = useTaskContext();
  const sessionActions = useSessionActionsContext();
  const [localPrompt, setLocalPrompt] = useState('');
  const [recordAudio, setRecordAudio] = useState(true);
  
  // Initialize local prompt from context when dialog opens
  useEffect(() => {
    if (isOpen) {
      setLocalPrompt(taskState.videoAnalysisPrompt || '');
    }
  }, [isOpen, taskState.videoAnalysisPrompt]);
  
  const handleStart = () => {
    // Save the prompt to both task context and session
    const promptToUse = localPrompt.trim();
    taskActions.setVideoAnalysisPrompt(promptToUse);
    sessionActions.updateCurrentSessionFields({ videoAnalysisPrompt: promptToUse });
    sessionActions.setSessionModified(true);
    
    // Start recording with the prompt
    onStartRecording(promptToUse, recordAudio);
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
              className="min-h-[100px] resize-none"
              autoFocus
            />
          </div>
          
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