"use client";

interface StatusMessagesProps {
  errorMessage: string;
  successMessage: string;
}

export function StatusMessages({ errorMessage, successMessage }: StatusMessagesProps) {
  return (
    <> {/* Keep fragment */}
      {errorMessage && <div className="text-destructive bg-destructive/10 p-2 rounded break-words">{errorMessage}</div>}
      {successMessage && <div className="text-green-600 dark:text-green-500 bg-green-500/10 p-2 rounded break-words">{successMessage}</div>}
    </>
  );
}