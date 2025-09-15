'use client'

import { useEffect, useState, useRef } from 'react'
import { useUpdater } from '@/hooks/use-updater'
import { useNotification } from '@/contexts/notification-context'
import { isTauriAvailable } from '@/utils/tauri-utils'

export function UpdaterStatus() {
  const { status, checkForUpdates, downloadAndInstallUpdate } = useUpdater()
  const { showNotification, showPersistentNotification, dismissNotification, showError } = useNotification()
  const [hasCheckedOnStartup, setHasCheckedOnStartup] = useState(false)
  const downloadNotificationIdRef = useRef<string | null>(null)
  const installNotificationIdRef = useRef<string | null>(null)

  // Check for updates on startup
  useEffect(() => {
    // Skip update check if platform doesn't support auto-updates
    if (!hasCheckedOnStartup && isTauriAvailable() && status.isSupported !== false) {
      setHasCheckedOnStartup(true)
      
      // If explicitly not supported, don't check
      if (status.isSupported === false) {
        console.log('[UpdaterStatus] Auto-updates not supported on this platform')
        return
      }
      
      checkForUpdates()
        .then(update => {
          if (update) {
            showNotification({
              title: 'Update Available',
              message: `Version ${update.version} is available. Would you like to install it?`,
              type: 'info',
              duration: 0, // Don't auto-dismiss
              actionButton: {
                label: 'Install Update',
                onClick: async () => {
                  try {
                    console.log('[UpdaterStatus] User clicked Install Update')
                    await downloadAndInstallUpdate(update)
                  } catch (error) {
                    console.error('[UpdaterStatus] Update installation error:', {
                      error,
                      errorMessage: error instanceof Error ? error.message : String(error)
                    })
                    
                    // Check if this is a user cancellation or interruption
                    const errorMessage = error instanceof Error ? error.message : String(error)
                    const isUserAction = errorMessage.toLowerCase().includes('interrupted') || 
                                       errorMessage.toLowerCase().includes('cancelled') ||
                                       errorMessage.toLowerCase().includes('canceled')
                    
                    if (!isUserAction) {
                      // Only show error for non-user-initiated issues
                      showError(error, 'Update installation failed')
                    }
                  }
                },
                variant: 'default'
              }
            })
          }
        })
        .catch(async error => {
          // Log the error to the database even though we don't show it to the user
          console.warn('Auto update check failed:', error)
          try {
            const { logError } = await import('@/utils/error-handling')
            await logError(error, 'Auto update check on startup')
          } catch (loggingError) {
            console.error('Failed to log update check error:', loggingError)
          }
        })
    }
  }, [hasCheckedOnStartup, checkForUpdates, downloadAndInstallUpdate, showNotification, showError, status.isSupported])

  // Show status notifications for download/install progress
  useEffect(() => {
    if (status.isDownloading) {
      // Dismiss any existing download notification and create a new one
      if (downloadNotificationIdRef.current) {
        dismissNotification(downloadNotificationIdRef.current)
      }
      const id = showPersistentNotification({
        title: 'Downloading Update',
        message: 'Update is being downloaded in the background...',
        type: 'info'
      })
      downloadNotificationIdRef.current = id
    } else if (downloadNotificationIdRef.current) {
      // Dismiss download notification when no longer downloading
      dismissNotification(downloadNotificationIdRef.current)
      downloadNotificationIdRef.current = null
    }
  }, [status.isDownloading, showPersistentNotification, dismissNotification])

  useEffect(() => {
    if (status.isInstalling) {
      // Dismiss any existing install notification and create a new one
      if (installNotificationIdRef.current) {
        dismissNotification(installNotificationIdRef.current)
      }
      const id = showPersistentNotification({
        title: 'Installing Update',
        message: 'The app will restart automatically when installation is complete.',
        type: 'info'
      })
      installNotificationIdRef.current = id
    } else if (installNotificationIdRef.current) {
      // Dismiss install notification when no longer installing
      dismissNotification(installNotificationIdRef.current)
      installNotificationIdRef.current = null
    }
  }, [status.isInstalling, showPersistentNotification, dismissNotification])

  // Show error notifications
  useEffect(() => {
    if (status.error) {
      // Check if this is a user-initiated interruption
      const isUserInterruption = status.error.toLowerCase().includes('interrupted by user') || 
                                status.error.toLowerCase().includes('user cancelled') ||
                                status.error.toLowerCase().includes('user canceled')
      
      if (isUserInterruption) {
        // For user interruptions, just show a simple notification without logging
        showNotification({
          title: 'Update Cancelled',
          message: 'The update process was cancelled.',
          type: 'info',
          duration: 3000
        })
      } else {
        // For actual errors, show error notification with logging
        showError(new Error(status.error), 'Update process failed')
      }
    }
  }, [status.error, showError, showNotification])

  // This component doesn't render anything visible
  // It just handles the update checking and notifications
  return null
}