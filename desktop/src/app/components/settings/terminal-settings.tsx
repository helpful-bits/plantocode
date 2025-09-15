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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui";
import { useNotification } from "@/contexts/notification-context";
import { invoke } from "@tauri-apps/api/core";
import { extractErrorInfo, createUserFriendlyErrorMessage, logError } from "@/utils/error-handling";

interface TerminalSettingsState {
  preferredCli: string;
  additionalArgs: string;
}

const CLI_OPTIONS = [
  { value: "claude", label: "Claude Code" },
  { value: "cursor", label: "Cursor" },
  { value: "codex", label: "Codex" },
  { value: "gemini", label: "Gemini" },
  { value: "custom", label: "Custom" },
];

export default function TerminalSettings() {
  const { showNotification } = useNotification();
  const [settings, setSettings] = useState<TerminalSettingsState>({
    preferredCli: "claude",
    additionalArgs: "",
  });
  const [customCommand, setCustomCommand] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);

      const [preferredCli, additionalArgs, customCmd] = await Promise.all([
        invoke<string | null>("get_key_value_command", { key: "terminal.preferred_cli" }),
        invoke<string | null>("get_key_value_command", { key: "terminal.additional_args" }),
        invoke<string | null>("get_key_value_command", { key: "terminal.custom_command" }),
      ]);

      setSettings({
        preferredCli: preferredCli || "claude",
        additionalArgs: additionalArgs || "",
      });

      setCustomCommand(customCmd || "");
    } catch (err) {
      const errorInfo = extractErrorInfo(err);
      const userMessage = createUserFriendlyErrorMessage(errorInfo, "terminal settings");

      await logError(err, "TerminalSettings.loadSettings");

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

      const promises = [
        invoke("set_key_value_command", {
          key: "terminal.preferred_cli",
          value: settings.preferredCli
        }),
        invoke("set_key_value_command", {
          key: "terminal.additional_args",
          value: settings.additionalArgs
        }),
      ];

      if (settings.preferredCli === "custom") {
        promises.push(
          invoke("set_key_value_command", {
            key: "terminal.custom_command",
            value: customCommand
          })
        );
      }

      await Promise.all(promises);

      showNotification({
        title: "Settings Saved",
        message: "Terminal settings have been updated successfully.",
        type: "success",
      });
    } catch (err) {
      const errorInfo = extractErrorInfo(err);
      const userMessage = createUserFriendlyErrorMessage(errorInfo, "saving terminal settings");

      await logError(err, "TerminalSettings.saveSettings");

      showNotification({
        title: "Save Error",
        message: userMessage,
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCliChange = (value: string) => {
    setSettings(prev => ({ ...prev, preferredCli: value }));
  };

  const handleAdditionalArgsChange = (value: string) => {
    setSettings(prev => ({ ...prev, additionalArgs: value }));
  };

  if (isLoading) {
    return (
      <Card className="bg-card/80 backdrop-blur-sm border border-border shadow-soft rounded-xl">
        <CardHeader>
          <CardTitle>Terminal Settings</CardTitle>
          <CardDescription>Loading terminal configuration...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card/80 backdrop-blur-sm border border-border shadow-soft rounded-xl">
        <CardHeader>
          <CardTitle>Terminal Settings</CardTitle>
          <CardDescription>
            Configure the CLI tool to use when starting terminal sessions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="cli-tool">CLI Tool</Label>
            <Select value={settings.preferredCli} onValueChange={handleCliChange}>
              <SelectTrigger id="cli-tool">
                <SelectValue placeholder="Select CLI tool" />
              </SelectTrigger>
              <SelectContent>
                {CLI_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {settings.preferredCli === "custom" && (
            <div className="space-y-2">
              <Label htmlFor="custom-command">Custom Command</Label>
              <Input
                id="custom-command"
                value={customCommand}
                onChange={(e) => setCustomCommand(e.target.value)}
                placeholder="Enter custom CLI command (e.g., my-cli-tool)"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="additional-args">Additional Arguments</Label>
            <Input
              id="additional-args"
              value={settings.additionalArgs}
              onChange={(e) => handleAdditionalArgsChange(e.target.value)}
              placeholder="Enter additional command line arguments (optional)"
            />
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
    </div>
  );
}