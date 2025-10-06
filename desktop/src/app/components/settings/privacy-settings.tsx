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
  Input,
  Label,
  Switch,
} from "@/ui";
import { useNotification } from "@/contexts/notification-context";
import { extractErrorInfo, createUserFriendlyErrorMessage, logError } from "@/utils/error-handling";
import { getDeviceSettings, updateDeviceSettings } from "@/actions/settings/settings.actions";
import { DeviceSettings } from "@/types/settings-types";

export default function PrivacySettings() {
  const { showNotification } = useNotification();
  const [settings, setSettings] = useState<DeviceSettings>({
    is_discoverable: true,
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

  const handleToggleChange = (field: keyof Omit<DeviceSettings, 'session_timeout_minutes'>, value: boolean) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleTimeoutChange = (value: string) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue > 0) {
      setSettings(prev => ({ ...prev, session_timeout_minutes: numValue }));
    }
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
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="discoverable">Device Discoverable</Label>
                <div className="text-sm text-muted-foreground">
                  Allow other devices to discover this device on the network
                </div>
              </div>
              <Switch
                id="discoverable"
                checked={settings.is_discoverable}
                onCheckedChange={(checked) => handleToggleChange('is_discoverable', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="remote-access">Allow Remote Access</Label>
                <div className="text-sm text-muted-foreground">
                  Enable remote connections to this device
                </div>
              </div>
              <Switch
                id="remote-access"
                checked={settings.allow_remote_access}
                onCheckedChange={(checked) => handleToggleChange('allow_remote_access', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="require-approval">Require Approval</Label>
                <div className="text-sm text-muted-foreground">
                  Require manual approval for new remote connections
                </div>
              </div>
              <Switch
                id="require-approval"
                checked={settings.require_approval}
                onCheckedChange={(checked) => handleToggleChange('require_approval', checked)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="session-timeout">Session Timeout (minutes)</Label>
            <Input
              id="session-timeout"
              type="number"
              min="1"
              max="1440"
              value={settings.session_timeout_minutes}
              onChange={(e) => handleTimeoutChange(e.target.value)}
              placeholder="30"
              className="w-32"
            />
            <div className="text-sm text-muted-foreground">
              Remote sessions will automatically expire after this duration
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
                <strong>Remote access is currently enabled.</strong> Other devices can connect to this application
                {settings.require_approval ? " after approval" : " immediately"}.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}