"use client";

interface StatusMessagesProps {
  errorMessage: string;
  successMessage: string;
}

export function StatusMessages({ errorMessage, successMessage }: StatusMessagesProps) {
  return (
    <>
      {errorMessage && <div className="text-destructive">{errorMessage}</div>}
      {successMessage && <div className="text-green-500 dark:text-green-400">{successMessage}</div>}
    </>
  );
} 