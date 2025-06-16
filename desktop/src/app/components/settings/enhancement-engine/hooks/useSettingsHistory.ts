import { useState, useCallback } from "react";
import { type TaskSettings } from "@/types/task-settings-types";
import { type SettingsHistory } from "../types";
import { useNotification } from "@/contexts/notification-context";

export function useSettingsHistory() {
  const { showNotification } = useNotification();
  const [settingsHistory, setSettingsHistory] = useState<SettingsHistory[]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);

  const addToHistory = useCallback((entry: SettingsHistory) => {
    setSettingsHistory(prev => {
      const newHistory = [...prev.slice(0, currentHistoryIndex + 1), entry];
      return newHistory.slice(-10);
    });
    setCurrentHistoryIndex(prev => Math.min(prev + 1, 9));
  }, [currentHistoryIndex]);

  const exportHistory = useCallback((history: SettingsHistory[]) => {
    const data = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      history
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibe-manager-history-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification({ title: 'History exported successfully', type: 'success' });
  }, [showNotification]);

  const importHistory = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.history) {
          setSettingsHistory(data.history);
          showNotification({ title: 'History imported successfully', type: 'success' });
        } else {
          throw new Error('Invalid file format');
        }
      } catch (error) {
        showNotification({ title: 'Failed to import history', type: 'error' });
      }
    };
    reader.readAsText(file);
  }, [showNotification]);

  const undoLastChange = useCallback((onSettingsChange: (settings: TaskSettings) => void) => {
    if (currentHistoryIndex > 0) {
      const previousSettings = settingsHistory[currentHistoryIndex - 1].settings;
      onSettingsChange(previousSettings);
      setCurrentHistoryIndex(prev => prev - 1);
      showNotification({ title: 'Changes undone', type: 'success' });
    }
  }, [currentHistoryIndex, settingsHistory, showNotification]);

  return {
    history: settingsHistory,
    addToHistory,
    exportHistory,
    importHistory,
    undoLastChange
  };
}