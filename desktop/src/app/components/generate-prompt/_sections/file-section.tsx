"use client";

import React from "react";

import { FileBrowser } from "../file-browser";

const FileSection = React.memo(function FileSection() {

  return (
    <>
      <FileBrowser />
    </>
  );
});

FileSection.displayName = "FileSection";

export default FileSection;