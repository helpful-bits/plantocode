"use client";

import React from "react";

import { useSessionStateContext } from "@/contexts/session";
import FileBrowser from "../file-browser";

interface FileSectionProps {
  disabled?: boolean;
}

const FileSection = React.memo(function FileSection({
  disabled = false,
}: FileSectionProps) {
  const { currentSession } = useSessionStateContext();

  return (
    <>
      <FileBrowser
        taskDescription={currentSession?.taskDescription || ""}
        disabled={disabled}
      />
    </>
  );
});

FileSection.displayName = "FileSection";

export default FileSection;