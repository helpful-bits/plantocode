export type ActionState<TData = unknown> = {
  isSuccess: boolean;
  message?: string;
  data?: TData;
};
