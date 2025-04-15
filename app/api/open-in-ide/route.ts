import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export async function POST(request: NextRequest) {
  try {
    const { filePath } = await request.json();

    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json({ error: 'File path is required and must be a string' }, { status: 400 });
    }

    // Resolve the path to prevent path traversal issues
    const resolvedFilePath = path.resolve(filePath);
    const patchesDir = path.resolve(process.cwd(), 'patches');

    // Security check: verify file exists and is in the patches directory
    try {
      await fs.access(resolvedFilePath); // Check existence and accessibility
      if (!resolvedFilePath.startsWith(patchesDir)) {
        console.warn(`Attempted to open file outside patches dir: ${resolvedFilePath}`);
        return NextResponse.json({ error: 'Unauthorized file path' }, { status: 403 });
      }
    } catch (err) {
      console.error(`File access error for ${resolvedFilePath}:`, err);
      return NextResponse.json({ error: 'File not found or inaccessible' }, { status: 404 });
    }

    // Determine platform-specific command
    // Ensure filePath is quoted to handle spaces or special characters
    const quotedPath = `"${resolvedFilePath}"`;
    let command;
    switch (os.platform()) {
      case 'darwin': // macOS
        command = `open ${quotedPath}`;
        break;
      case 'win32': // Windows
        // 'start ""' is used to handle paths with spaces correctly
        command = `start "" ${quotedPath}`;
        break;
      default: // Linux and others
        command = `xdg-open ${quotedPath}`;
        break;
    }

    // Execute command asynchronously
    exec(command, (error) => {
      if (error) {
        console.error(`Error opening file "${resolvedFilePath}" in IDE:`, error);
        // Note: We don't return an error response here, as the frontend handles fallback
      } else {
        console.log(`Successfully requested to open file: ${resolvedFilePath}`);
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in open-in-ide endpoint:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
