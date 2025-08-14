import { lazy, Suspense, ComponentType } from 'react';
import { Loader2 } from 'lucide-react';



export const CreditManagerAsync = lazy(() => 
  import('./components/CreditManager').then(module => ({ 
    default: module.CreditManager 
  }))
);


export const InvoicesListAsync = lazy(() => 
  import('./components/InvoicesList').then(module => ({ 
    default: module.InvoicesList 
  }))
);

export const BillingHistoryAsync = lazy(() => import('./components/BillingHistory').then(module => ({ default: module.BillingHistory })));

export const BillingHistoryModalAsync = lazy(() => import('./components/BillingHistoryModal').then(module => ({ default: module.BillingHistoryModal })));

export const PaymentPollingScreenAsync = lazy(() => 
  import('./components/PaymentPollingScreen').then(module => ({ 
    default: module.PaymentPollingScreen 
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
export const InvoicesList = withBillingSuspense(InvoicesListAsync);
export const BillingHistory = withBillingSuspense(BillingHistoryAsync);
export const BillingHistoryModal = withBillingSuspense(BillingHistoryModalAsync);
export const PaymentPollingScreen = withBillingSuspense(PaymentPollingScreenAsync);

export function preloadBillingComponents(): void {
  setTimeout(() => {
    import('./components/CreditManager');
    import('./components/InvoicesList');
    import('./components/BillingHistory');
    import('./components/BillingHistoryModal');
    import('./components/PaymentPollingScreen');
  }, 500);
}
export { LoadingSkeleton, ErrorState, ProcessingState } from './components/loading-and-error-states';