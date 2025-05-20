/**
 * Subscription information interface
 */
export interface SubscriptionInfo {
  plan: string;
  status: string;
  trialEndsAt?: string | null;
  currentPeriodEndsAt?: string | null;
  monthlyTokenLimit?: number | null;
  isTrialing?: boolean;
  hasCancelled?: boolean;
  nextInvoiceAmount?: number | null;
  currency?: string;
  usage: {
    tokensInput: number;
    tokensOutput: number;
    totalCost: number;
  };
}
