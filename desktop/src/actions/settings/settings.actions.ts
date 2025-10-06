/**
 * Settings Actions
 *
 * Actions for managing application settings and device configuration.
 */

import { invoke } from "@tauri-apps/api/core";
import { DeviceSettings } from "@/types/settings-types";

/**
 * Get current device settings
 */
export const getDeviceSettings = async (): Promise<DeviceSettings> => {
  return await invoke<DeviceSettings>("get_device_settings");
};

/**
 * Update device settings
 */
export const updateDeviceSettings = async (settings: DeviceSettings): Promise<void> => {
  await invoke("update_device_settings", { settings });
};

/**
 * Get a specific app setting
 */
export const getAppSetting = async (key: string): Promise<string | null> => {
  return await invoke<string | null>("get_key_value_command", { key });
};

/**
 * Set a specific app setting
 */
export const setAppSetting = async (key: string, value: string): Promise<void> => {
  await invoke("set_key_value_command", { key, value });
};