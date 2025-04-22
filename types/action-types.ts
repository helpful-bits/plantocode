export type ActionState<TData = unknown> = {
  isSuccess: boolean;
  message?: string; // Keep message optional
  data?: TData;
  clipboardFeedback?: boolean; // Indicates that clipboard feedback should be shown in the UI
};
