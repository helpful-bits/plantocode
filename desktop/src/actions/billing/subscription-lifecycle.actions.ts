import { openBillingPortal } from './portal.actions';

/**
 * Manage subscription lifecycle actions through the Stripe billing portal.
 * This function centralizes all subscription management (cancel, resume, reactivate)
 * through the Stripe Customer Portal for a consistent user experience.
 */
export async function manageSubscription(): Promise<string> {
  return await openBillingPortal();
}