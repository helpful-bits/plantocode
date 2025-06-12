"use client";

import { useState, useRef, useCallback } from "react";
import { transcribeAudioChunk } from "@/actions/voice-transcription/transcribe";
import { getErrorMessage, logError } from "@/utils/error-handling";


interface ChunkTranscriptionState {
  text: string;
  chunkIndex: number;
  isProcessing: boolean;
  error?: string;
  processingTimeMs?: number;
}

interface UseBatchTranscriptionProcessorProps {
  sessionId: string;
  languageCode?: string;
  transcriptionPrompt?: string;
  transcriptionModel?: string;
  temperature?: number;
  onTextUpdate?: (fullText: string) => void;
  onChunkComplete?: (chunk: ChunkTranscriptionState) => void;
  onError?: (error: string) => void;
}

export function useBatchTranscriptionProcessor({
  sessionId,
  languageCode = "en",
  transcriptionPrompt,
  temperature,
  onTextUpdate,
  onChunkComplete,
  onError,
}: UseBatchTranscriptionProcessorProps) {
  const [processedChunks, setProcessedChunks] = useState<Map<number, ChunkTranscriptionState>>(new Map());
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  
  // Use refs to track active processing to avoid race conditions
  const activeProcessingRef = useRef<Set<number>>(new Set());
  const isMountedRef = useRef(true);
  
  // Build full text from processed chunks in order
  const buildFullText = useCallback((chunks: Map<number, ChunkTranscriptionState>): string => {
    const orderedChunks = Array.from(chunks.values())
      .filter(chunk => chunk.text.trim() !== "")
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
    
    return orderedChunks.map(chunk => chunk.text.trim()).join(" ");
  }, []);

  // Process a single audio chunk
  const processAudioChunk = useCallback(async (audioChunk: Blob): Promise<void> => {
    if (!sessionId || !isMountedRef.current) {
      return;
    }

    const chunkIndex = currentChunkIndex;
    setCurrentChunkIndex(prev => prev + 1);
    
    // Skip if already processing this chunk
    if (activeProcessingRef.current.has(chunkIndex)) {
      return;
    }
    
    activeProcessingRef.current.add(chunkIndex);
    setIsProcessing(true);

    try {
      // Mark chunk as processing
      setProcessedChunks(prev => {
        const newMap = new Map(prev);
        newMap.set(chunkIndex, {
          text: "",
          chunkIndex,
          isProcessing: true,
        });
        return newMap;
      });

      // Use the action instead of duplicating logic
      const result = await transcribeAudioChunk(
        audioChunk,
        chunkIndex,
        sessionId,
        languageCode === "en" ? undefined : languageCode,
        transcriptionPrompt,
        temperature
      );

      if (!isMountedRef.current) return;

      // Update the chunk with results
      const chunkState: ChunkTranscriptionState = {
        text: result.text || "",
        chunkIndex: result.chunkIndex,
        isProcessing: false,
        processingTimeMs: result.processingTimeMs,
      };

      setProcessedChunks(prev => {
        const newMap = new Map(prev);
        newMap.set(chunkIndex, chunkState);
        
        // Build full text and notify
        const fullText = buildFullText(newMap);
        onTextUpdate?.(fullText);
        
        return newMap;
      });

      onChunkComplete?.(chunkState);


    } catch (error) {
      
      if (!isMountedRef.current) return;

      const errorMessage = getErrorMessage(error, "transcription");
      
      // Mark chunk as failed
      setProcessedChunks(prev => {
        const newMap = new Map(prev);
        newMap.set(chunkIndex, {
          text: "",
          chunkIndex,
          isProcessing: false,
          error: errorMessage,
        });
        return newMap;
      });

      onError?.(errorMessage);
      await logError(error, "useBatchTranscriptionProcessor", { chunkIndex, sessionId });

    } finally {
      activeProcessingRef.current.delete(chunkIndex);
      
      const hasActiveProcessing = Array.from(processedChunks.values()).some(chunk => chunk.isProcessing) ||
                                   activeProcessingRef.current.size > 0;
      
      if (!hasActiveProcessing) {
        setIsProcessing(false);
      }
    }
  }, [sessionId, languageCode, currentChunkIndex, onTextUpdate, onChunkComplete, onError, buildFullText, processedChunks]);

  const getCurrentText = useCallback((): string => {
    return buildFullText(processedChunks);
  }, [processedChunks, buildFullText]);

  const resetProcessor = useCallback(() => {
    setProcessedChunks(new Map());
    setCurrentChunkIndex(0);
    setIsProcessing(false);
    activeProcessingRef.current.clear();
  }, []);

  const getStats = useCallback(() => {
    const chunks = Array.from(processedChunks.values());
    const totalChunks = chunks.length;
    const completedChunks = chunks.filter(c => !c.isProcessing && !c.error).length;
    const failedChunks = chunks.filter(c => c.error).length;
    const processingChunks = chunks.filter(c => c.isProcessing).length;
    
    return {
      totalChunks,
      completedChunks,
      failedChunks,
      processingChunks,
      successRate: totalChunks > 0 ? (completedChunks / totalChunks) * 100 : 0,
    };
  }, [processedChunks]);

  const cleanup = useCallback(() => {
    isMountedRef.current = false;
    activeProcessingRef.current.clear();
  }, []);

  return {
    processAudioChunk,
    processedChunks,
    isProcessing,
    getCurrentText,
    resetProcessor,
    getStats,
    cleanup,
    chunks: Array.from(processedChunks.values()).sort((a, b) => a.chunkIndex - b.chunkIndex),
  };
}