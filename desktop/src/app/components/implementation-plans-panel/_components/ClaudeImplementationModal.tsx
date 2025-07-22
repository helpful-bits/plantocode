import React from "react";
import { Command } from "@tauri-apps/plugin-shell";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/ui/dialog";
import { TerminalView } from "@/ui/TerminalView";

interface ClaudeImplementationModalProps {
  isOpen: boolean;
  onClose: () => void;
  command: Command<string> | null;
  prompt: string;
}

export const ClaudeImplementationModal: React.FC<ClaudeImplementationModalProps> = ({
  isOpen,
  onClose,
  command,
  prompt
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Implement with Claude Code</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden bg-[#1e1e1e] rounded-md p-2">
          <TerminalView command={command} initialPrompt={prompt} />
        </div>
      </DialogContent>
    </Dialog>
  );
};