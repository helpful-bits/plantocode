import { useRef, useCallback, useState } from "react";
import { type TaskSettings } from "@/types/task-settings-types";
import { useNotification } from "@/contexts/notification-context";

export function useSettingsImportExport() {
  const { showNotification } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const exportSettings = useCallback((taskSettings: TaskSettings) => {
    const data = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      settings: taskSettings
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibe-manager-settings-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification({ title: 'Settings exported successfully', type: 'success' });
  }, [showNotification]);

  const importSettings = useCallback((
    event: React.ChangeEvent<HTMLInputElement>,
    onSettingsChange: (settings: TaskSettings) => void,
    addToHistory: (entry: any) => void
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.settings) {
          onSettingsChange(data.settings);
          addToHistory({
            id: `import-${Date.now()}`,
            timestamp: new Date(),
            description: `Imported settings from ${file.name}`,
            settings: data.settings,
          });
          showNotification({ title: 'Settings imported successfully', type: 'success' });
        } else {
          throw new Error('Invalid file format');
        }
      } catch (error) {
        setLastError(`Import failed: ${error}`);
        showNotification({ title: 'Failed to import settings', type: 'error' });
      }
    };
    reader.readAsText(file);
  }, [showNotification]);

  return {
    exportSettings,
    importSettings,
    fileInputRef,
    lastError
  };
}