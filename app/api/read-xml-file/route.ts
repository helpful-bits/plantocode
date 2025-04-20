import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filePath } = body;

    if (!filePath) {
      return NextResponse.json(
        { error: 'File path is required' },
        { status: 400 }
      );
    }

    // Check if the file exists and is readable
    try {
      await fs.access(filePath, fs.constants.R_OK);
    } catch (error) {
      return NextResponse.json(
        { error: `File not found or not accessible: ${filePath}` },
        { status: 404 }
      );
    }

    // Read the file content
    const content = await fs.readFile(filePath, 'utf-8');

    // Return the file content
    return NextResponse.json({ content });
  } catch (error) {
    console.error('Error reading XML file:', error);
    return NextResponse.json(
      { error: 'Failed to read file: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
} 