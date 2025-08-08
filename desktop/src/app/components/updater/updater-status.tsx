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
    if (!hasCheckedOnStartup && isTauriAvailable()) {
      setHasCheckedOnStartup(true)
      
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
                    await downloadAndInstallUpdate(update)
                  } catch (error) {
                    showError(error, 'Update installation failed')
                  }
                },
                variant: 'default'
              }
            })
          }
        })
        .catch(error => {
          // Silently handle update check failures on startup
          // Only show errors if user manually checks
          console.warn('Auto update check failed:', error)
        })
    }
  }, [hasCheckedOnStartup, checkForUpdates, downloadAndInstallUpdate, showNotification, showError])

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
      showError(new Error(status.error), 'Update process failed')
    }
  }, [status.error, showError])

  // This component doesn't render anything visible
  // It just handles the update checking and notifications
  return null
}