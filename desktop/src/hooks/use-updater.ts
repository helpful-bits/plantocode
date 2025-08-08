import { useState, useCallback } from 'react'
import { check, Update, type DownloadEvent } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export interface UpdateStatus {
  isChecking: boolean
  isDownloading: boolean
  isInstalling: boolean
  updateAvailable: boolean
  currentVersion?: string
  availableVersion?: string
  error?: string
  downloadProgress?: number
  contentLength?: number
}

export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>({
    isChecking: false,
    isDownloading: false,
    isInstalling: false,
    updateAvailable: false
  })

  const checkForUpdates = useCallback(async (): Promise<Update | null> => {
    setStatus(prev => ({ ...prev, isChecking: true, error: undefined }))

    try {
      const update = await check()
      
      if (update) {
        setStatus(prev => ({
          ...prev,
          isChecking: false,
          updateAvailable: true,
          currentVersion: update.currentVersion,
          availableVersion: update.version
        }))
        return update
      } else {
        setStatus(prev => ({
          ...prev,
          isChecking: false,
          updateAvailable: false
        }))
        return null
      }
    } catch (error) {
      setStatus(prev => ({
        ...prev,
        isChecking: false,
        error: error instanceof Error ? error.message : 'Failed to check for updates'
      }))
      return null
    }
  }, [])

  const downloadAndInstallUpdate = useCallback(async (update: Update): Promise<void> => {
    setStatus(prev => ({ ...prev, isDownloading: true, error: undefined }))

    try {
      // Download and install with progress tracking
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === 'Started') {
          setStatus(prev => ({
            ...prev,
            isDownloading: true,
            downloadProgress: 0,
            contentLength: event.data.contentLength
          }))
        } else if (event.event === 'Progress') {
          setStatus(prev => ({
            ...prev,
            downloadProgress: prev.downloadProgress 
              ? prev.downloadProgress + event.data.chunkLength 
              : event.data.chunkLength
          }))
        } else if (event.event === 'Finished') {
          setStatus(prev => ({
            ...prev,
            isDownloading: false,
            isInstalling: true
          }))
        }
      })
      
      // Relaunch the application
      await relaunch()
      
    } catch (error) {
      setStatus(prev => ({
        ...prev,
        isDownloading: false,
        isInstalling: false,
        error: error instanceof Error ? error.message : 'Failed to install update'
      }))
    }
  }, [])

  const checkAndInstallUpdate = useCallback(async (): Promise<void> => {
    const update = await checkForUpdates()
    if (update) {
      await downloadAndInstallUpdate(update)
    }
  }, [checkForUpdates, downloadAndInstallUpdate])

  return {
    status,
    checkForUpdates,
    downloadAndInstallUpdate,
    checkAndInstallUpdate
  }
}