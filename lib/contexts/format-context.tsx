"use client";

import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { OutputFormat } from "@/types";

interface FormatContextType {
  outputFormat: OutputFormat;
  customFormat: string;
  setOutputFormat: (format: OutputFormat) => void;
  setCustomFormat: (format: string) => void;
}

const FORMAT_KEY = "o1-pro-flow-format";
const CUSTOM_FORMAT_KEY = "o1-pro-flow-custom-format";

const FormatContext = createContext<FormatContextType | undefined>(undefined);

export function FormatProvider({ children }: { children: ReactNode }) {
  const [outputFormat, setOutputFormatState] = useState<OutputFormat>("diff");
  const [customFormat, setCustomFormatState] = useState<string>("");

  // Load saved format on mount
  useEffect(() => {
    const savedFormat = localStorage.getItem(FORMAT_KEY) as OutputFormat;
    const savedCustomFormat = localStorage.getItem(CUSTOM_FORMAT_KEY);
    
    if (savedFormat) setOutputFormatState(savedFormat);
    if (savedCustomFormat) setCustomFormatState(savedCustomFormat);
  }, []);

  const setOutputFormat = (format: OutputFormat) => {
    setOutputFormatState(format);
    localStorage.setItem(FORMAT_KEY, format);
  };

  const setCustomFormat = (format: string) => {
    setCustomFormatState(format);
    localStorage.setItem(CUSTOM_FORMAT_KEY, format);
  };

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