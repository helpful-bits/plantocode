/**
 * Async-loaded billing components for code splitting and performance optimization
 */

import { lazy, Suspense, ComponentType } from 'react';
import { Loader2 } from 'lucide-react';

// Async load heavy billing components

export const PaymentMethodsManagerAsync = lazy(() => 
  import('./components/payment-methods-manager').then(module => ({ 
    default: module.PaymentMethodsManager 
  }))
);

export const SubscriptionReactivationModalAsync = lazy(() => 
  import('./components/subscription-reactivation-modal').then(module => ({ 
    default: module.SubscriptionReactivationModal 
  }))
);

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

export const InvoiceHistoryManagerAsync = lazy(() => 
  import('./components/invoice-history-manager').then(module => ({ 
    default: module.InvoiceHistoryManager 
  }))
);

// Loading fallback component optimized for billing modals
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

// Wrapper function to add Suspense to any async component
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

// Pre-wrapped components ready to use (clean naming without "Async" suffix)
export const PaymentMethodsManager = withBillingSuspense(PaymentMethodsManagerAsync);
export const SubscriptionReactivationModal = withBillingSuspense(SubscriptionReactivationModalAsync);
export const CreditManager = withBillingSuspense(CreditManagerAsync);
export const SubscriptionModal = withBillingSuspense(SubscriptionModalAsync);
export const InvoiceHistoryManager = withBillingSuspense(InvoiceHistoryManagerAsync);

// Preload function for likely-to-be-used components
export function preloadBillingComponents(): void {
  // Preload the most commonly used components
  setTimeout(() => {
    import('./components/payment-methods-manager');
  }, 100);
  
  // Preload other components after a delay
  setTimeout(() => {
    import('./components/credit-manager');
  }, 500);
}

// Critical components that should be loaded immediately (not lazy)
export { LoadingSkeleton, ErrorState, NoSubscriptionState, ProcessingState } from './components/loading-and-error-states';