/**
 * Settings Types
 *
 * Type definitions for application settings and device configuration.
 */

export interface DeviceSettings {
  is_discoverable: boolean;
  allow_remote_access: boolean;
  require_approval: boolean;
  session_timeout_minutes: number;
}