import { EmptyState } from "@/ui";
import { useSessionStateContext } from "@/contexts/session";

export const NoActiveSessionState = () => {
  const { currentSession, isSessionLoading } = useSessionStateContext();

  if (isSessionLoading) {
    return (
      <div className="text-muted-foreground">Loading session…</div>
    );
  }

  if (!currentSession) {
    return (
      <EmptyState
        title="No Active Session"
        description="Create a new session or select an existing one to begin."
        variant="no-data"
      />
    );
  }

  return null;
};
