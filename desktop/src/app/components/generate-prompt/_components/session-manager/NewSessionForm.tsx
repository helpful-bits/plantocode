"use client";

import { Save } from "lucide-react";


import { Button } from "@/ui/button";
import { Input } from "@/ui/input";

import type React from "react";

interface NewSessionFormProps {
  sessionNameInput: string;
  onSessionNameInputChange: (value: string) => void;
  onSave: () => void;
  isLoading: boolean;
  disabled: boolean;
  globalIsSwitching: boolean;
}

const NewSessionForm: React.FC<NewSessionFormProps> = ({
  sessionNameInput,
  onSessionNameInputChange,
  onSave,
  isLoading,
  disabled,
  globalIsSwitching,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="grid grid-cols-4 gap-2 flex-1">
          <div className="col-span-3">
            <Input
              value={sessionNameInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onSessionNameInputChange(e.target.value)
              }
              placeholder="Session name"
              disabled={isLoading || globalIsSwitching || disabled}
              className="w-full h-9"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={onSave}
              disabled={
                !sessionNameInput.trim() || globalIsSwitching || disabled
              }
              isLoading={isLoading}
              loadingText="Saving..."
              className="flex-1 h-9"
            >
              <Save className="h-4 w-4 mr-1.5" />
              Save
            </Button>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-1 text-balance">
        Save the current task description and file selections as a new session.
      </p>
    </div>
  );
};

export default NewSessionForm;
