"use client";

import React from "react";

import FileBrowser from "../file-browser";

interface FileSectionProps {
  disabled?: boolean;
}

const FileSection = React.memo(function FileSection({
  disabled = false,
}: FileSectionProps) {

  return (
    <>
      <FileBrowser
        disabled={disabled}
      />
    </>
  );
});

FileSection.displayName = "FileSection";

export default FileSection;