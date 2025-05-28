/**
 * Subscription information interface
 */
export interface SubscriptionInfo {
  plan: string;
  planName?: string;
  status: string;
  trialEndsAt?: string | null;
  currentPeriodEndsAt?: string | null;
  monthlySpendingAllowance?: number | null;
  hardSpendingLimit?: number | null;
  isTrialing?: boolean;
  hasCancelled?: boolean;
  nextInvoiceAmount?: number | null;
  currency?: string;
  usage: {
    currentSpending: number;
    monthlyAllowance: number;
    hardLimit: number;
    cycleStartDate?: string | null;
    cycleEndDate?: string | null;
    usagePercentage: number;
    servicesBlocked: boolean;
    currency: string;
    trialDaysRemaining?: number | null;
    planName?: string | null;
  };
}
