
import { Button } from "@/ui/button";
import { EmptyState } from "@/ui/empty-state";
import { NotificationBanner } from "@/ui/notification-banner";


/**
 * Loading skeleton component
 */
export function LoadingSkeleton() {
  return (
  <div className="animate-pulse">
    <div className="h-6 w-32 bg-muted rounded mb-4"></div>
    <div className="h-4 w-24 bg-muted rounded mb-2"></div>
    <div className="h-4 w-40 bg-muted rounded mb-4"></div>
    <div className="h-10 w-full bg-muted rounded"></div>
  </div>
  );
}

/**
 * Error state component
 */
interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
  <div>
    <NotificationBanner
      variant="error"
      title="Subscription Error"
      message={message}
      className="mb-2"
      onDismiss={undefined}
      autoClose={false}
    />
    <Button
      onClick={onRetry}
      className="w-full"
      variant="destructive"
      size="sm"
    >
      Retry
    </Button>
  </div>
  );
}

/**
 * No subscription state component
 */
interface NoSubscriptionStateProps {
  onUpgrade: () => void;
}

export function NoSubscriptionState({
  onUpgrade,
}: NoSubscriptionStateProps) {
  return (
  <EmptyState
    variant="default"
    title="No Subscription"
    description="Get started with a subscription to access premium features."
    actionText="Upgrade to Pro"
    onAction={onUpgrade}
    className="border-none p-4"
  />
  );
}
