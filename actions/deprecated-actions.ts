"use server";

import { promises as fs } from 'fs';
import path from 'path';
import { ActionState } from '@/types';
import { findDeprecatedFiles, DeprecatedFile } from '@/lib/find-deprecated';

export async function findDeprecatedFilesAction(projectDir: string): Promise<ActionState<DeprecatedFile[]>> {
  try {
    const files = await findDeprecatedFiles(projectDir);
    return {
      isSuccess: true,
      message: `Found ${files.length} deprecated files`,
      data: files
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: 'Failed to find deprecated files'
    };
  }
}

export async function deleteDeprecatedFileAction(projectDir: string, filePath: string): Promise<ActionState<void>> {
  try {
    const fullPath = path.join(projectDir, filePath);
    await fs.unlink(fullPath);
    return {
      isSuccess: true,
      message: `Successfully deleted ${filePath}`,
      data: undefined
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: `Failed to delete ${filePath}`
    };
  }
} 