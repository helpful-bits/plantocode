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
              disabled={isLoading || globalIsSwitching}
              className="w-full h-9"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => { void onSave(); }}
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
        Create a new session with fresh, empty settings.
      </p>
    </div>
  );
};

NewSessionForm.displayName = "NewSessionForm";

export default NewSessionForm;
