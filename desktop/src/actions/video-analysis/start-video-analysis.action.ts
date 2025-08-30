import { invoke } from '@tauri-apps/api/core';
import type { VideoAnalysisJobResponse } from '@/types/video-analysis-types';

export interface StartVideoAnalysisJobParams {
  sessionId: string;
  projectDirectory: string;
  videoPath: string;
  prompt: string;
  durationMs: number;
  framerate: number;
}

export async function startVideoAnalysisJob(params: StartVideoAnalysisJobParams): Promise<VideoAnalysisJobResponse> {
  return invoke<VideoAnalysisJobResponse>('start_video_analysis_job', {
    sessionId: params.sessionId,
    projectDirectory: params.projectDirectory,
    videoPath: params.videoPath,
    prompt: params.prompt,
    durationMs: params.durationMs,
    framerate: params.framerate
  });
}