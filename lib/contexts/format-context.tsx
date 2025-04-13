"use client";

import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from "react";
import { OutputFormat } from "@/types";
import { useDatabase } from "./database-context";

interface FormatContextType {
  outputFormat: OutputFormat;
  customFormat: string;
  setOutputFormat: (format: OutputFormat) => void;
  setCustomFormat: (format: string) => void;
}

const FORMAT_KEY = "format";
const CUSTOM_FORMAT_KEY = "custom-format";
// Remove localStorage keys - they're no longer needed

const FormatContext = createContext<FormatContextType | undefined>(undefined);

export function FormatProvider({ children }: { children: ReactNode }) {
  const [outputFormat, setOutputFormatState] = useState<OutputFormat>("diff");
  const [customFormat, setCustomFormatState] = useState<string>("");
  const { repository } = useDatabase();

  // Load saved format from database
  useEffect(() => {
    const loadFormatPreferences = async () => {
      try {
        // Load from database
        const savedFormat = await repository.getCachedState("global", "global", FORMAT_KEY);
        const savedCustomFormat = await repository.getCachedState("global", "global", CUSTOM_FORMAT_KEY);
        
        if (savedFormat) {
          setOutputFormatState(savedFormat as OutputFormat);
        }

        if (savedCustomFormat) {
          setCustomFormatState(savedCustomFormat);
        }
      } catch (e) {
        console.error("Failed to load format preferences from database:", e);
      }
    };
    
    loadFormatPreferences();
  }, [repository]);

  const setOutputFormat = useCallback(async (format: OutputFormat) => {
    setOutputFormatState(format);
    
    try {
      // Save to database
      await repository.saveCachedState("global", "global", FORMAT_KEY, format);
    } catch (e) {
      console.error("Failed to save output format to database:", e);
    }
  }, [repository]);

  const setCustomFormat = useCallback(async (format: string) => {
    setCustomFormatState(format);
    
    try {
      // Save to database
      await repository.saveCachedState("global", "global", CUSTOM_FORMAT_KEY, format);
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