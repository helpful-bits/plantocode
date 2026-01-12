"use client";

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
} from "@/ui";
import { Switch } from "@/ui/switch";
import { useNotification } from "@/contexts/notification-context";
import {
  extractErrorInfo,
  createUserFriendlyErrorMessage,
  logError,
} from "@/utils/error-handling";

const CODEX_CLI_SETTING_KEY = "codex_cli_enabled";

export default function CodexCliSettings() {
  const { showNotification } = useNotification();
  const [enabled, setEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadSetting = async () => {
      try {
        setIsLoading(true);
        const storedValue = await invoke<string | null>("get_app_setting", {
          key: CODEX_CLI_SETTING_KEY,
        });
        setEnabled(storedValue === "true");
      } catch (err) {
        const errorInfo = extractErrorInfo(err);
        const userMessage = createUserFriendlyErrorMessage(
          errorInfo,
          "Codex CLI settings"
        );

        await logError(err, "CodexCliSettings.loadSetting");

        showNotification({
          title: "Settings Load Error",
          message: userMessage,
          type: "error",
        });
      } finally {
        setIsLoading(false);
      }
    };

    void loadSetting();
  }, [showNotification]);

  const handleToggle = async (checked: boolean) => {
    if (isSaving) return;

    const previousValue = enabled;
    setEnabled(checked);
    setIsSaving(true);

    try {
      await invoke("set_app_setting", {
        key: CODEX_CLI_SETTING_KEY,
        value: checked.toString(),
      });

      showNotification({
        title: "Codex CLI Routing Updated",
        message: checked
          ? "OpenAI requests will route through Codex CLI."
          : "OpenAI requests will use the server proxy.",
        type: "success",
      });
    } catch (err) {
      setEnabled(previousValue);

      const errorInfo = extractErrorInfo(err);
      const userMessage = createUserFriendlyErrorMessage(
        errorInfo,
        "updating Codex CLI settings"
      );

      await logError(err, "CodexCliSettings.handleToggle");

      showNotification({
        title: "Settings Update Error",
        message: userMessage,
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="bg-card/80 backdrop-blur-sm border border-border shadow-soft rounded-xl">
      <CardHeader>
        <CardTitle>Codex CLI Routing</CardTitle>
        <CardDescription>
          Route OpenAI model requests through the local Codex CLI when enabled.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="codex-cli-toggle" className="text-sm font-medium">
              Use Codex CLI for OpenAI requests
            </Label>
            <p className="text-xs text-muted-foreground">
              Requires Codex CLI installed and logged in. Non-OpenAI models keep
              using the server proxy.
            </p>
          </div>
          <Switch
            id="codex-cli-toggle"
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={isLoading || isSaving}
            className="[&[data-state=unchecked]]:bg-muted [&[data-state=unchecked]]:border-border/50 [&[data-state=unchecked]:hover]:bg-muted/80"
          />
        </div>
      </CardContent>
    </Card>
  );
}
