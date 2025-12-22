'use client';

import { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  Checkbox,
} from '@/ui';
import { useNotification } from '@/contexts/notification-context';
import { extractErrorInfo, createUserFriendlyErrorMessage, logError } from '@/utils/error-handling';
import { getDeviceSettings, updateDeviceSettings } from '@/actions/settings/settings.actions';
import type { DeviceSettings } from '@/types/settings-types';

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
    background_run_enabled: false,
    start_with_system: false,
    show_notifications: false,
    minimize_to_tray_on_close: false,
    launch_minimized: false,
  });
  const [deviceSettings, setDeviceSettings] = useState<DeviceSettings>({
    allow_remote_access: false,
  });
  const [loading, setLoading] = useState(true);
  const isInitialMount = useRef(true);
  const prefsSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const deviceSettingsSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const loadedPrefs = await invoke<BackgroundPrefs>('get_background_prefs_command');
      setPrefs(loadedPrefs);

      const loadedDeviceSettings = await getDeviceSettings();
      setDeviceSettings(loadedDeviceSettings);
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
      // Mark initial mount as complete after loading
      isInitialMount.current = false;
    }
  };

  // Auto-save background preferences when they change
  useEffect(() => {
    if (isInitialMount.current) return;

    if (prefsSaveTimeoutRef.current) {
      clearTimeout(prefsSaveTimeoutRef.current);
    }

    prefsSaveTimeoutRef.current = setTimeout(async () => {
      try {
        await invoke('set_background_prefs_command', { prefs });
      } catch (err) {
        const errorInfo = extractErrorInfo(err);
        const userMessage = createUserFriendlyErrorMessage(errorInfo, "saving background preferences");

        await logError(err, "BackgroundSettings.autoSavePrefs");

        showNotification({
          title: "Save Error",
          message: userMessage,
          type: "error",
        });
      }
    }, 500);

    return () => {
      if (prefsSaveTimeoutRef.current) {
        clearTimeout(prefsSaveTimeoutRef.current);
      }
    };
  }, [prefs, showNotification]);

  // Auto-save device settings when they change
  useEffect(() => {
    if (isInitialMount.current) return;

    if (deviceSettingsSaveTimeoutRef.current) {
      clearTimeout(deviceSettingsSaveTimeoutRef.current);
    }

    deviceSettingsSaveTimeoutRef.current = setTimeout(async () => {
      try {
        await updateDeviceSettings(deviceSettings);
      } catch (err) {
        const errorInfo = extractErrorInfo(err);
        const userMessage = createUserFriendlyErrorMessage(errorInfo, "saving device settings");

        await logError(err, "BackgroundSettings.autoSaveDeviceSettings");

        showNotification({
          title: "Save Error",
          message: userMessage,
          type: "error",
        });
      }
    }, 500);

    return () => {
      if (deviceSettingsSaveTimeoutRef.current) {
        clearTimeout(deviceSettingsSaveTimeoutRef.current);
      }
    };
  }, [deviceSettings, showNotification]);

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
          <CardTitle>Device Visibility & Privacy</CardTitle>
          <CardDescription>
            Control whether this desktop computer can be discovered and controlled by your mobile phones running PlanToCode.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="remote-access"
                checked={deviceSettings.allow_remote_access}
                onCheckedChange={(checked) => setDeviceSettings(prev => ({ ...prev, allow_remote_access: Boolean(checked) }))}
              />
              <div className="space-y-0.5">
                <Label htmlFor="remote-access" className="cursor-pointer">Allow Remote Access</Label>
                <div className="text-sm text-muted-foreground">
                  Make this computer visible and controllable from your phone. When enabled, you can use the PlanToCode mobile app to control this desktop application remotely.
                </div>
              </div>
            </div>
          </div>

          {deviceSettings.allow_remote_access && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
              <div className="text-sm text-blue-700 dark:text-blue-300">
                <strong>Remote access is enabled.</strong> This computer is now discoverable by the PlanToCode mobile app on your phone. You can connect and control this desktop application remotely from your mobile device.
              </div>
            </div>
          )}

          {!deviceSettings.allow_remote_access && (
            <div className="p-3 bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700 rounded-md">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                <strong>Remote access is disabled.</strong> This computer is hidden from the PlanToCode mobile app. Enable remote access to control this desktop from your phone.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card/80 backdrop-blur-sm border border-border shadow-soft rounded-xl">
        <CardHeader>
          <CardTitle>Background & Tray</CardTitle>
          <CardDescription>
            When enabled, closing the window hides PlanToCode to the system tray to keep your mobile connection alive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="background-run"
                checked={prefs.background_run_enabled}
                onCheckedChange={(v) => updatePref('background_run_enabled', v as boolean)}
              />
              <div className="space-y-0.5">
                <Label htmlFor="background-run" className="text-sm font-medium cursor-pointer">Run in background</Label>
                <p className="text-xs text-muted-foreground">Keep the app running when window is closed</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Checkbox
                id="minimize-to-tray"
                checked={prefs.minimize_to_tray_on_close}
                onCheckedChange={(v) => updatePref('minimize_to_tray_on_close', v as boolean)}
              />
              <div className="space-y-0.5">
                <Label htmlFor="minimize-to-tray" className="text-sm font-medium cursor-pointer">Minimize to tray on close</Label>
                <p className="text-xs text-muted-foreground">Hide to system tray instead of quitting</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Checkbox
                id="start-with-system"
                checked={prefs.start_with_system}
                onCheckedChange={(v) => updatePref('start_with_system', v as boolean)}
              />
              <div className="space-y-0.5">
                <Label htmlFor="start-with-system" className="text-sm font-medium cursor-pointer">Start with system</Label>
                <p className="text-xs text-muted-foreground">Launch automatically on system startup</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Checkbox
                id="show-notifications"
                checked={prefs.show_notifications}
                onCheckedChange={(v) => updatePref('show_notifications', v as boolean)}
              />
              <div className="space-y-0.5">
                <Label htmlFor="show-notifications" className="text-sm font-medium cursor-pointer">Show notifications</Label>
                <p className="text-xs text-muted-foreground">Display system notifications for events</p>
              </div>
            </div>
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
