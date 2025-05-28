"use client";

import React, { useMemo } from "react";

import { useSessionStateContext } from "@/contexts/session";
import FileBrowser from "../file-browser";

interface FileSectionProps {
  disabled?: boolean;
}

const FileSection = React.memo(function FileSection({
  disabled = false,
}: FileSectionProps) {
  const { currentSession } = useSessionStateContext();



  // Create a minimal regex state for compatibility
  const regexState = useMemo(() => ({
    titleRegex: "",
    contentRegex: "",
    negativeTitleRegex: "",
    negativeContentRegex: "",
    isRegexActive: false,
    regexPatternGenerationError: null,
  }), []);

  return (
    <>
      <FileBrowser
        regexState={regexState}
        taskDescription={currentSession?.taskDescription || ""}
        disabled={disabled}
      />
    </>
  );
});

FileSection.displayName = "FileSection";

export default FileSection;