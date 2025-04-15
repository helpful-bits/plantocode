"use client";
 
import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from "react";
import { OutputFormat } from "@/types";
import { useDatabase } from "./database-context"; // Keep useDatabase import
 
interface FormatContextType { // Define interface for context type
  outputFormat: OutputFormat;
  customFormat: string;
  setOutputFormat: (format: OutputFormat) => void;
  setCustomFormat: (format: string) => void;
}

const FORMAT_KEY = "format";
const CUSTOM_FORMAT_KEY = "custom-format";

const FormatContext = createContext<FormatContextType | undefined>(undefined);

export function FormatProvider({ children }: { children: ReactNode }) {
  const [outputFormat, setOutputFormatState] = useState<OutputFormat>("diff");
  const [customFormat, setCustomFormatState] = useState<string>("");
  const { repository, isInitialized } = useDatabase(); // Use isInitialized
  const loadedRef = useRef(false); // Reference to track if format preferences have been loaded

  useEffect(() => {
    // Only load once when initialized and not already loaded
    if (isInitialized && !loadedRef.current) {
      const loadFormatPreferences = async () => {
        console.log("[FormatContext] Attempting to load format preferences from DB");
          // Load global format settings from database
          const savedFormat = await repository.getCachedState("global" as unknown as OutputFormat, "global" as unknown as OutputFormat, FORMAT_KEY);
          const savedCustomFormat = await repository.getCachedState("global" as unknown as OutputFormat, "global" as unknown as OutputFormat, CUSTOM_FORMAT_KEY);
          
          if (savedFormat) {
            setOutputFormatState(savedFormat as OutputFormat); // Correct type assertion
            console.log("[FormatContext] Loaded format:", savedFormat);
          }

          if (savedCustomFormat) {
            setCustomFormatState(savedCustomFormat);
            console.log("[FormatContext] Loaded custom format"); // Log loaded format
          }
          
          // Mark as loaded to prevent repeated loading
          loadedRef.current = true;
      };
      
      loadFormatPreferences();
    }
  }, [repository, isInitialized]); // Dependencies

  const setOutputFormat = useCallback(async (format: OutputFormat) => {
    setOutputFormatState(format);
    console.log("[FormatContext] Setting output format:", format);
    
    try {
      // Save to database
      await repository.saveCachedState("global" as unknown as OutputFormat, "global" as unknown as OutputFormat, FORMAT_KEY, format);
    } catch (e) {
      console.error("Failed to save output format to database:", e);
    }
  }, [repository]);

  const setCustomFormat = useCallback(async (format: string) => {
    setCustomFormatState(format);
    console.log("[FormatContext] Setting custom format");
    
    try {
      // Save to database
      await repository.saveCachedState("global" as unknown as OutputFormat, "global" as unknown as OutputFormat, CUSTOM_FORMAT_KEY, format);
    } catch (e) {
      console.error("Failed to save custom format to database:", e);
    }
  }, [repository]);

  return (
    <FormatContext.Provider value={{ outputFormat, customFormat, setOutputFormat, setCustomFormat }}>
      {children}
    </FormatContext.Provider>
  );
}

export function useFormat() {
  const context = useContext(FormatContext);
  if (context === undefined) {
    throw new Error("useFormat must be used within a FormatProvider");
  }
  return context;
}
