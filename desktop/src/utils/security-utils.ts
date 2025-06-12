/**
 * Security utilities for billing operations
 */

/**
 * Rate limiter using in-memory store
 */
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 10) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Get existing requests for this identifier
    let userRequests = this.requests.get(identifier) || [];
    
    // Remove old requests outside the time window
    userRequests = userRequests.filter(timestamp => timestamp > windowStart);
    
    // Check if under the limit
    if (userRequests.length >= this.maxRequests) {
      return false;
    }
    
    // Add current request
    userRequests.push(now);
    this.requests.set(identifier, userRequests);
    
    return true;
  }
}

// Rate limiters for different operations
export const paymentRateLimiter = new RateLimiter(60000, 5); // 5 requests per minute for payments

/**
 * Input validation for billing forms
 */
export interface SecureBillingFormData {
  companyName?: string;
  contactEmail: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
  taxId?: string;
  phone?: string;
}

/**
 * Validates and sanitizes billing form data
 */
export function validateSecureBillingForm(data: any): { isValid: boolean; sanitizedData?: SecureBillingFormData; errors: string[] } {
  const errors: string[] = [];
  const sanitized: any = {};

  // Contact email (required)
  if (!data.contactEmail || typeof data.contactEmail !== 'string') {
    errors.push('Contact email is required');
  } else {
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailPattern.test(data.contactEmail)) {
      errors.push('Invalid email format');
    } else {
      sanitized.contactEmail = data.contactEmail.trim().toLowerCase();
    }
  }

  // Address validation (simplified)
  if (!data.address || typeof data.address !== 'object') {
    errors.push('Address is required');
  } else {
    sanitized.address = {
      line1: data.address.line1?.trim() || '',
      line2: data.address.line2?.trim(),
      city: data.address.city?.trim() || '',
      state: data.address.state?.trim(),
      postalCode: data.address.postalCode?.trim() || '',
      country: data.address.country?.trim() || '',
    };

    if (!sanitized.address.line1) errors.push('Address line 1 is required');
    if (!sanitized.address.city) errors.push('City is required');
    if (!sanitized.address.postalCode) errors.push('Postal code is required');
    if (!sanitized.address.country) errors.push('Country is required');
  }

  // Optional fields
  if (data.companyName) {
    sanitized.companyName = data.companyName.trim();
  }
  if (data.taxId) {
    sanitized.taxId = data.taxId.trim();
  }
  if (data.phone) {
    sanitized.phone = data.phone.trim();
  }

  return {
    isValid: errors.length === 0,
    sanitizedData: errors.length === 0 ? sanitized as SecureBillingFormData : undefined,
    errors
  };
}