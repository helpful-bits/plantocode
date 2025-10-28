'use client';

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Save } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Label,
} from '@/ui';
import { Switch } from '@/ui/switch';
import { useNotification } from '@/contexts/notification-context';
import { extractErrorInfo, createUserFriendlyErrorMessage, logError } from '@/utils/error-handling';

type BackgroundPrefs = {
  background_run_enabled: boolean;
  start_with_system: boolean;
  show_notifications: boolean;
  minimize_to_tray_on_close: boolean;
  launch_minimized: boolean;
};

export default function BackgroundSettings() {
  const { showNotification } = useNotification();
  const [prefs, setPrefs] = useState<BackgroundPrefs>({
    background_run_enabled: true,
    start_with_system: false,
    show_notifications: true,
    minimize_to_tray_on_close: true,
    launch_minimized: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const loadedPrefs = await invoke<BackgroundPrefs>('get_background_prefs_command');
      setPrefs(loadedPrefs);
    } catch (err) {
      const errorInfo = extractErrorInfo(err);
      const userMessage = createUserFriendlyErrorMessage(errorInfo, "loading background preferences");

      await logError(err, "BackgroundSettings.loadPreferences");

      showNotification({
        title: "Load Error",
        message: userMessage,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    try {
      setSaving(true);
      await invoke('set_background_prefs_command', { prefs });

      showNotification({
        title: "Settings Saved",
        message: "Background preferences have been updated successfully.",
        type: "success",
      });

      // Reload preferences to confirm they were saved
      await loadPreferences();
    } catch (err) {
      const errorInfo = extractErrorInfo(err);
      const userMessage = createUserFriendlyErrorMessage(errorInfo, "saving background preferences");

      await logError(err, "BackgroundSettings.savePreferences");

      showNotification({
        title: "Save Error",
        message: userMessage,
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const updatePref = <K extends keyof BackgroundPrefs>(key: K, value: BackgroundPrefs[K]) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <Card className="bg-card/80 backdrop-blur-sm border border-border shadow-soft rounded-xl">
        <CardHeader>
          <CardTitle>Background & Tray</CardTitle>
          <CardDescription>Loading preferences...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card/80 backdrop-blur-sm border border-border shadow-soft rounded-xl">
        <CardHeader>
          <CardTitle>Background & Tray</CardTitle>
          <CardDescription>
            When enabled, closing the window hides PlanToCode to the system tray to keep your mobile connection alive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Run in background</Label>
                <p className="text-xs text-muted-foreground">Keep the app running when window is closed</p>
              </div>
              <Switch
                checked={prefs.background_run_enabled}
                onCheckedChange={(v) => updatePref('background_run_enabled', v)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Minimize to tray on close</Label>
                <p className="text-xs text-muted-foreground">Hide to system tray instead of quitting</p>
              </div>
              <Switch
                checked={prefs.minimize_to_tray_on_close}
                onCheckedChange={(v) => updatePref('minimize_to_tray_on_close', v)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Start with system</Label>
                <p className="text-xs text-muted-foreground">Launch automatically on system startup</p>
              </div>
              <Switch
                checked={prefs.start_with_system}
                onCheckedChange={(v) => updatePref('start_with_system', v)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Launch minimized</Label>
                <p className="text-xs text-muted-foreground">Start hidden in system tray</p>
              </div>
              <Switch
                checked={prefs.launch_minimized}
                onCheckedChange={(v) => updatePref('launch_minimized', v)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Show notifications</Label>
                <p className="text-xs text-muted-foreground">Display system notifications for events</p>
              </div>
              <Switch
                checked={prefs.show_notifications}
                onCheckedChange={(v) => updatePref('show_notifications', v)}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={savePreferences}
              disabled={saving}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Preferences'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80 backdrop-blur-sm border border-border shadow-soft rounded-xl">
        <CardHeader>
          <CardTitle>System Tray Tips</CardTitle>
          <CardDescription>
            Use the system tray icon to quickly access app features.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p>When running in the system tray:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Click the tray icon to show or hide the main window</li>
              <li>Right-click for a menu with quick actions</li>
              <li>Your mobile device connection stays active even when hidden</li>
              <li>Use the "Quit" option to completely exit the application</li>
            </ul>
          </div>

          {prefs.background_run_enabled && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
              <div className="text-sm text-blue-700 dark:text-blue-300">
                <strong>Background mode is enabled.</strong> The app will minimize to the system tray when you close the window.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
