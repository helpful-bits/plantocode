'use client'

import { useEffect, useState } from 'react'
import { useUpdater } from '@/hooks/use-updater'
import { useNotification } from '@/contexts/notification-context'

export function UpdaterStatus() {
  const { status, checkForUpdates, downloadAndInstallUpdate } = useUpdater()
  const { showNotification, showError } = useNotification()
  const [hasCheckedOnStartup, setHasCheckedOnStartup] = useState(false)

  // Check for updates on startup
  useEffect(() => {
    if (!hasCheckedOnStartup) {
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
      showNotification({
        title: 'Downloading Update',
        message: 'Update is being downloaded in the background...',
        type: 'info',
        duration: 0
      })
    } else if (status.isInstalling) {
      showNotification({
        title: 'Installing Update',
        message: 'The app will restart automatically when installation is complete.',
        type: 'info',
        duration: 0
      })
    }
  }, [status.isDownloading, status.isInstalling, showNotification])

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