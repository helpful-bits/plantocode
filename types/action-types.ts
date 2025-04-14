export type ActionState<TData = unknown> = { // Changed generic name for clarity
  isSuccess: boolean;
  message?: string;
  data?: TData; // Make data optional
};