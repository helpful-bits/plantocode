export type ActionState<T> = 
  | { isSuccess: true; message: string; data: T }
  | { isSuccess: false; message: string; data?: never }; 

export type OutputFormat = "diff" | "refactoring" | "custom"; 