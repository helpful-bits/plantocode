import { useState, useCallback, useEffect } from 'react'
import { check, Update, type DownloadEvent } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { platform } from '@tauri-apps/plugin-os'

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
  isSupported?: boolean
}

export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>({
    isChecking: false,
    isDownloading: false,
    isInstalling: false,
    updateAvailable: false,
    isSupported: true
  })

  useEffect(() => {
    // Check if platform supports updates
    const currentPlatform = platform()
    // Currently only macOS is supported for auto-updates
    // Windows updates are handled through Microsoft Store
    const isSupported = currentPlatform === 'macos'
    setStatus(prev => ({ ...prev, isSupported }))
  }, [])

  const checkForUpdates = useCallback(async (): Promise<Update | null> => {
    const currentPlatform = platform()
    
    // Don't check for updates on unsupported platforms
    if (currentPlatform !== 'macos') {
      console.log('[Updater] Updates not supported on this platform:', currentPlatform)
      return null
    }

    setStatus(prev => ({ ...prev, isChecking: true, error: undefined }))

    try {
      // Checking for updates...
      const update = await check()
      
      if (update) {
        // Update available
        setStatus(prev => ({
          ...prev,
          isChecking: false,
          updateAvailable: true,
          currentVersion: update.currentVersion,
          availableVersion: update.version
        }))
        return update
      } else {
        // No updates available
        setStatus(prev => ({
          ...prev,
          isChecking: false,
          updateAvailable: false
        }))
        return null
      }
    } catch (error) {
      // Error during check
      const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'string' 
          ? error 
          : 'Unknown updater error during check'
      
      setStatus(prev => ({
        ...prev,
        isChecking: false,
        error: errorMessage
      }))
      return null
    }
  }, [status.isSupported])

  const downloadAndInstallUpdate = useCallback(async (update: Update): Promise<void> => {
    const currentPlatform = platform()
    
    // Don't attempt to download/install on unsupported platforms
    if (currentPlatform !== 'macos') {
      console.log('[Updater] Download/install not supported on this platform:', currentPlatform)
      throw new Error('Updates not supported on this platform')
    }

    setStatus(prev => ({ ...prev, isDownloading: true, error: undefined }))

    try {
      console.log('[Updater] Starting download and install for version:', update.version)
      
      // Download and install with progress tracking
      await update.downloadAndInstall((event: DownloadEvent) => {
        console.log('[Updater] Download event:', event.event)
        
        if (event.event === 'Started') {
          console.log('[Updater] Download started, content length:', event.data.contentLength)
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
          console.log('[Updater] Download finished, starting installation')
          setStatus(prev => ({
            ...prev,
            isDownloading: false,
            isInstalling: true
          }))
        }
      })
      
      // Relaunch the app after successful installation
      console.log('[Updater] Update installed successfully, relaunching...')
      await relaunch()
      
    } catch (error) {
      console.error('[Updater] Error during download/install:', {
        error,
        errorType: typeof error,
        errorName: error instanceof Error ? error.name : 'unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      })
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'string' 
          ? error 
          : 'Unknown updater error during install'
      
      setStatus(prev => ({
        ...prev,
        isDownloading: false,
        isInstalling: false,
        error: errorMessage
      }))
      
      // Re-throw for the caller to handle if needed
      throw error
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