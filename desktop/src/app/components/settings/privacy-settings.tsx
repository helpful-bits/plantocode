"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Checkbox,
  Label,
} from "@/ui";
import { useNotification } from "@/contexts/notification-context";
import { extractErrorInfo, createUserFriendlyErrorMessage, logError } from "@/utils/error-handling";
import { getDeviceSettings, updateDeviceSettings } from "@/actions/settings/settings.actions";
import { DeviceSettings } from "@/types/settings-types";

export default function PrivacySettings() {
  const { showNotification } = useNotification();
  const [settings, setSettings] = useState<DeviceSettings>({
    is_discoverable: false,
    allow_remote_access: false,
    require_approval: true,
    session_timeout_minutes: 30,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const deviceSettings = await getDeviceSettings();
      setSettings(deviceSettings);
    } catch (err) {
      const errorInfo = extractErrorInfo(err);
      const userMessage = createUserFriendlyErrorMessage(errorInfo, "privacy settings");

      await logError(err, "PrivacySettings.loadSettings");

      showNotification({
        title: "Settings Load Error",
        message: userMessage,
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setIsSaving(true);
      await updateDeviceSettings(settings);

      showNotification({
        title: "Settings Saved",
        message: "Privacy settings have been updated successfully.",
        type: "success",
      });

      // Reload settings to confirm they were saved
      await loadSettings();
    } catch (err) {
      const errorInfo = extractErrorInfo(err);
      const userMessage = createUserFriendlyErrorMessage(errorInfo, "saving privacy settings");

      await logError(err, "PrivacySettings.saveSettings");

      showNotification({
        title: "Save Error",
        message: userMessage,
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCheckboxChange = (field: keyof DeviceSettings, value: boolean) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <Card className="bg-card/80 backdrop-blur-sm border border-border shadow-soft rounded-xl">
        <CardHeader>
          <CardTitle>Device Visibility & Privacy</CardTitle>
          <CardDescription>Loading privacy configuration...</CardDescription>
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
            Control how your device appears to other devices and manages remote access permissions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="discoverable"
                checked={settings.is_discoverable}
                onCheckedChange={(checked) => handleCheckboxChange('is_discoverable', checked as boolean)}
              />
              <div className="space-y-0.5">
                <Label htmlFor="discoverable" className="cursor-pointer">Device Discoverable</Label>
                <div className="text-sm text-muted-foreground">
                  Allow other devices to discover this device on the network
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Checkbox
                id="remote-access"
                checked={settings.allow_remote_access}
                onCheckedChange={(checked) => handleCheckboxChange('allow_remote_access', checked as boolean)}
              />
              <div className="space-y-0.5">
                <Label htmlFor="remote-access" className="cursor-pointer">Allow Remote Access</Label>
                <div className="text-sm text-muted-foreground">
                  Enable remote connections to this device
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={saveSettings}
              disabled={isSaving}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80 backdrop-blur-sm border border-border shadow-soft rounded-xl">
        <CardHeader>
          <CardTitle>Remote Access</CardTitle>
          <CardDescription>
            Configure how remote devices can connect to this application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p>When remote access is enabled:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Other authenticated devices can connect to this application</li>
              <li>Remote users can view and interact with your sessions</li>
              <li>All remote activities are logged for security</li>
              <li>You can revoke access at any time</li>
            </ul>
          </div>

          {settings.allow_remote_access && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
              <div className="text-sm text-blue-700 dark:text-blue-300">
                <strong>Remote access is currently enabled.</strong> Other devices can connect to this application.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}