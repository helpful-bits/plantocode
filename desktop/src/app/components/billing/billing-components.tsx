import { lazy, Suspense, ComponentType } from 'react';
import { Loader2 } from 'lucide-react';



export const CreditManagerAsync = lazy(() => 
  import('./components/CreditManager').then(module => ({ 
    default: module.CreditManager 
  }))
);

export const SubscriptionModalAsync = lazy(() => 
  import('./components/subscription-modal').then(module => ({ 
    default: module.SubscriptionModal 
  }))
);

export const InvoicesListAsync = lazy(() => 
  import('./components/InvoicesList').then(module => ({ 
    default: module.InvoicesList 
  }))
);

export const PaymentMethodsListAsync = lazy(() => 
  import('./components/PaymentMethodsList').then(module => ({ 
    default: module.PaymentMethodsList 
  }))
);

export const CreditTransactionHistoryAsync = lazy(() => 
  import('./components/CreditTransactionHistory').then(module => ({ 
    default: module.CreditTransactionHistory 
  }))
);

export const UsageDetailsModalAsync = lazy(() => 
  import('./components/UsageDetailsModal').then(module => ({ 
    default: module.UsageDetailsModal 
  }))
);

export const AddPaymentMethodModalAsync = lazy(() => 
  import('./components/AddPaymentMethodModal').then(module => ({ 
    default: module.AddPaymentMethodModal 
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
export const InvoicesList = withBillingSuspense(InvoicesListAsync);
export const PaymentMethodsList = withBillingSuspense(PaymentMethodsListAsync);
export const CreditTransactionHistory = withBillingSuspense(CreditTransactionHistoryAsync);
export const UsageDetailsModal = withBillingSuspense(UsageDetailsModalAsync);
export const AddPaymentMethodModal = withBillingSuspense(AddPaymentMethodModalAsync);

export function preloadBillingComponents(): void {
  setTimeout(() => {
    import('./components/CreditManager');
    import('./components/InvoicesList');
    import('./components/PaymentMethodsList');
    import('./components/CreditTransactionHistory');
    import('./components/AddPaymentMethodModal');
    import('./components/UsageDetailsModal');
  }, 500);
}
export { LoadingSkeleton, ErrorState, NoSubscriptionState, ProcessingState } from './components/loading-and-error-states';