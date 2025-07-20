"use client";

import { Save } from "lucide-react";

import { Button } from "@/ui/button";
import { Input } from "@/ui/input";

interface NewSessionFormProps {
  sessionNameInput: string;
  onSessionNameInputChange: (value: string) => void;
  onSave: () => Promise<void>;
  isLoading: boolean;
  disabled: boolean;
  globalIsSwitching: boolean;
}

const NewSessionForm = ({
  sessionNameInput,
  onSessionNameInputChange,
  onSave,
  isLoading,
  disabled,
  globalIsSwitching,
}: NewSessionFormProps) => {
  return (
    <div className="flex items-center gap-2">
      <Input
        value={sessionNameInput}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onSessionNameInputChange(e.target.value)
        }
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            void onSave();
          }
        }}
        placeholder="New session name..."
        disabled={isLoading || globalIsSwitching}
        className="flex-1 h-9"
      />
      <Button
        onClick={() => { void onSave(); }}
        disabled={
          !sessionNameInput.trim() || globalIsSwitching || disabled
        }
        isLoading={isLoading}
        loadingText="Saving..."
        className="h-9"
      >
        <Save className="h-4 w-4 mr-1.5" />
        Save
      </Button>
    </div>
  );
};

NewSessionForm.displayName = "NewSessionForm";

export default NewSessionForm;
