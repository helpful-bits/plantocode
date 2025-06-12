import { invoke } from '@tauri-apps/api/core';
import type { 
  PaymentMethodsResponse,
  PaymentMethod,
  SetupIntentResponse 
} from '@/types/tauri-commands';

/**
 * Get all payment methods for the user
 */
export async function getPaymentMethods(): Promise<PaymentMethodsResponse> {
  return await invoke<PaymentMethodsResponse>('get_payment_methods_command');
}

/**
 * Create a SetupIntent for adding a new payment method
 */
export async function createSetupIntent(): Promise<SetupIntentResponse> {
  return await invoke<SetupIntentResponse>('create_setup_intent_command');
}

/**
 * Delete a payment method
 */
export async function deletePaymentMethod(id: string): Promise<void> {
  return await invoke<void>('delete_payment_method_command', { id });
}

/**
 * Set a payment method as default
 */
export async function setDefaultPaymentMethod(id: string): Promise<void> {
  return await invoke<void>('set_default_payment_method_command', { id });
}

// Note: getStripePublishableKey is exported from portal.actions.ts to avoid duplication


/**
 * Validate payment method information
 */
export function validatePaymentMethod(paymentMethod: Partial<PaymentMethod>): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!paymentMethod.id) {
    errors.push('Payment method ID is required');
  }

  if (paymentMethod.expMonth && paymentMethod.expYear) {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    
    if (paymentMethod.expYear < currentYear || 
        (paymentMethod.expYear === currentYear && paymentMethod.expMonth < currentMonth)) {
      errors.push('Payment method has expired');
    }
    
    if (paymentMethod.expMonth < 1 || paymentMethod.expMonth > 12) {
      errors.push('Invalid expiration month');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Format payment method for display
 */
export function formatPaymentMethod(paymentMethod: PaymentMethod): {
  displayName: string;
  displayNumber: string;
  displayExpiry: string;
  isExpired: boolean;
  expiresWithinMonths: number;
} {
  const brand = paymentMethod.brand || paymentMethod.typeName || 'Card';
  const lastFour = paymentMethod.lastFour || '****';
  
  const displayName = `${brand.charAt(0).toUpperCase() + brand.slice(1)} ending in ${lastFour}`;
  const displayNumber = `•••• •••• •••• ${lastFour}`;
  
  let displayExpiry = 'No expiry info';
  let isExpired = false;
  let expiresWithinMonths = Infinity;
  
  if (paymentMethod.expMonth && paymentMethod.expYear) {
    displayExpiry = `${paymentMethod.expMonth.toString().padStart(2, '0')}/${paymentMethod.expYear}`;
    
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    
    isExpired = paymentMethod.expYear < currentYear || 
                (paymentMethod.expYear === currentYear && paymentMethod.expMonth < currentMonth);
    
    if (!isExpired) {
      const expiryDate = new Date(paymentMethod.expYear, paymentMethod.expMonth - 1, 1);
      const monthsDiff = (expiryDate.getFullYear() - currentYear) * 12 + 
                        (expiryDate.getMonth() - currentMonth + 1);
      expiresWithinMonths = Math.max(0, monthsDiff);
    }
  }
  
  return {
    displayName,
    displayNumber,
    displayExpiry,
    isExpired,
    expiresWithinMonths
  };
}

/**
 * Get payment methods with enhanced information
 */
export async function getEnhancedPaymentMethods(): Promise<Array<PaymentMethod & {
  displayName: string;
  displayNumber: string;
  displayExpiry: string;
  isExpired: boolean;
  expiresWithinMonths: number;
  needsAttention: boolean;
}>> {
  const response = await getPaymentMethods();
  
  return response.paymentMethods.map(pm => {
    const formatted = formatPaymentMethod(pm);
    const needsAttention = formatted.isExpired || formatted.expiresWithinMonths <= 2;
    
    return {
      ...pm,
      ...formatted,
      needsAttention
    };
  });
}

/**
 * Check if user has any valid payment methods
 */
export async function hasValidPaymentMethods(): Promise<{
  hasAny: boolean;
  hasDefault: boolean;
  hasValid: boolean;
  expiredCount: number;
  expiringCount: number;
}> {
  try {
    const enhanced = await getEnhancedPaymentMethods();
    const response = await getPaymentMethods();
    
    const expired = enhanced.filter(pm => pm.isExpired);
    const expiringSoon = enhanced.filter(pm => !pm.isExpired && pm.expiresWithinMonths <= 2);
    const valid = enhanced.filter(pm => !pm.isExpired);
    
    return {
      hasAny: enhanced.length > 0,
      hasDefault: response.hasDefault,
      hasValid: valid.length > 0,
      expiredCount: expired.length,
      expiringCount: expiringSoon.length
    };
  } catch (error) {
    return {
      hasAny: false,
      hasDefault: false,
      hasValid: false,
      expiredCount: 0,
      expiringCount: 0
    };
  }
}

