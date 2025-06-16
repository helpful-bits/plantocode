import { lazy, Suspense, ComponentType } from 'react';
import { Loader2 } from 'lucide-react';



export const CreditManagerAsync = lazy(() => 
  import('./components/credit-manager').then(module => ({ 
    default: module.CreditManager 
  }))
);

export const SubscriptionModalAsync = lazy(() => 
  import('./components/subscription-modal').then(module => ({ 
    default: module.SubscriptionModal 
  }))
);

function BillingModalLoader() {
  return (
    <div className="flex items-center justify-center p-8 min-h-[200px]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading billing component...</p>
      </div>
    </div>
  );
}

export function withBillingSuspense<T extends object>(
  AsyncComponent: ComponentType<T>
): ComponentType<T> {
  return function WrappedComponent(props: T) {
    return (
      <Suspense fallback={<BillingModalLoader />}>
        <AsyncComponent {...props} />
      </Suspense>
    );
  };
}

export const CreditManager = withBillingSuspense(CreditManagerAsync);
export const SubscriptionModal = withBillingSuspense(SubscriptionModalAsync);

export function preloadBillingComponents(): void {
  setTimeout(() => {
    import('./components/credit-manager');
  }, 500);
}
export { LoadingSkeleton, ErrorState, NoSubscriptionState, ProcessingState } from './components/loading-and-error-states';