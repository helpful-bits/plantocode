"use client";

import React from "react";

import { SimpleFileBrowser } from "../simple-file-browser";

const FileSection = React.memo(function FileSection() {

  return (
    <>
      <SimpleFileBrowser />
    </>
  );
});

FileSection.displayName = "FileSection";

export default FileSection;