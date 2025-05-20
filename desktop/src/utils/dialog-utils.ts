/**
 * Dialog Utilities
 *
 * This file contains utility functions for working with the Tauri dialog plugin.
 * These functions provide a convenient interface for showing native dialogs in the desktop app.
 */

import {
  message,
  ask,
  confirm,
  open,
  save,
  type OpenDialogOptions,
  type SaveDialogOptions,
  type MessageDialogOptions,
} from "@tauri-apps/plugin-dialog";

/**
 * Shows a simple message dialog with an "Ok" button
 * @param content The message to display
 * @param title Optional dialog title
 * @param options Additional dialog options
 * @returns Promise that resolves when the dialog is closed
 */
export async function showMessage(
  content: string,
  title?: string,
  options: Partial<MessageDialogOptions> = {}
): Promise<void> {
  await message(content, {
    title,
    ...options,
  });
}

/**
 * Shows a confirmation dialog with "Yes" and "No" buttons
 * @param content The question to display
 * @param title Optional dialog title
 * @param options Additional dialog options
 * @returns Promise that resolves to true if "Yes" was clicked, false otherwise
 */
export async function showConfirmation(
  content: string,
  title?: string,
  options: Partial<MessageDialogOptions> = {}
): Promise<boolean> {
  return await ask(content, {
    title,
    kind: "info",
    ...options,
  });
}

/**
 * Shows a dialog with "Ok" and "Cancel" buttons
 * @param content The question to display
 * @param title Optional dialog title
 * @param options Additional dialog options
 * @returns Promise that resolves to true if "Ok" was clicked, false otherwise
 */
export async function showOkCancel(
  content: string,
  title?: string,
  options: Partial<MessageDialogOptions> = {}
): Promise<boolean> {
  return await confirm(content, {
    title,
    ...options,
  });
}

/**
 * Opens a file selection dialog
 * @param options Dialog options
 * @returns Promise that resolves to the selected file path(s) or null if canceled
 */
export async function selectFile(
  options: Partial<OpenDialogOptions> = {}
): Promise<string | null> {
  return await open({
    multiple: false,
    directory: false,
    ...options,
  });
}

/**
 * Opens a directory selection dialog
 * @param options Dialog options
 * @returns Promise that resolves to the selected directory path or null if canceled
 */
export async function selectDirectory(
  options: Partial<OpenDialogOptions> = {}
): Promise<string | null> {
  return await open({
    multiple: false,
    directory: true,
    ...options,
  });
}

/**
 * Opens a multi-file selection dialog
 * @param options Dialog options
 * @returns Promise that resolves to the selected file paths or null if canceled
 */
export async function selectMultipleFiles(
  options: Partial<OpenDialogOptions> = {}
): Promise<string[] | null> {
  return (await open({
    multiple: true,
    directory: false,
    ...options,
  })) as string[] | null;
}

/**
 * Opens a save file dialog
 * @param options Dialog options
 * @returns Promise that resolves to the selected file path or null if canceled
 */
export async function saveFile(
  options: Partial<SaveDialogOptions> = {}
): Promise<string | null> {
  return await save(options);
}

/**
 * Example error dialog
 * @param title Error title
 * @param content Error details
 */
export async function showError(title: string, content: string): Promise<void> {
  await message(content, {
    title,
    kind: "error",
  });
}

/**
 * Example warning dialog
 * @param title Warning title
 * @param content Warning details
 */
export async function showWarning(
  title: string,
  content: string
): Promise<void> {
  await message(content, {
    title,
    kind: "warning",
  });
}
