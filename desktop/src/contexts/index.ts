// Export all application-level contexts from a central file

// Core contexts
export {
  useAuth,
  AuthProvider,
  type DesktopAuthContextType as AuthContextValue,
} from "./auth-context";
export {
  useDatabase,
  DatabaseProvider,
  type DatabaseContextValue,
} from "./database-context";
export {
  useNotification,
  NotificationProvider,
  type NotificationContextValue,
} from "./notification-context";
export {
  useProject,
  ProjectProvider,
  type ProjectContextValue,
} from "./project-context";
export {
  useUILayout,
  UILayoutProvider,
  type UILayoutContextType as UILayoutContextValue,
} from "./ui-layout-context";
export {
  DeviceLinkProvider,
  useDeviceLink,
  type DeviceLinkContextValue,
  type DeviceLinkStatusRaw,
  type DeviceLinkConnectionState,
} from "./device-link-context";

// Background jobs system
export * from "./background-jobs";

// Session management
export {
  SessionProvider,
  useSessionStateContext,
  useSessionActionsContext,
} from "./session";

// Text improvement system
export * from "./text-improvement";
