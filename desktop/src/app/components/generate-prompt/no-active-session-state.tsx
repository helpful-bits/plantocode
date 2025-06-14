import { EmptyState } from "@/ui";

export const NoActiveSessionState = () => {
  return (
    <EmptyState
      title="No Active Session"
      description="Create a new session or select an existing one to begin."
      variant="no-data"
    />
  );
};