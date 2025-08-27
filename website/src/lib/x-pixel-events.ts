// X (Twitter) Pixel Event Tracking Functions
// Based on your X Ads Manager configuration

// Event IDs from your X Ads Manager
const X_PIXEL_ID = process.env.NEXT_PUBLIC_X_PIXEL_ID || 'qd2ik';
const X_EVENTS = {
  PAGE_VIEW: 'qe9er',        // Currently inactive
  ADD_TO_CART: 'qd2iq',      // Currently inactive
  DOWNLOAD: 'qd2io',         // Active - Main conversion event
  LEAD_GENERATION: 'qd2in',  // Currently inactive
  PURCHASE: 'qd2il',         // Currently inactive
} as const;

// Helper to check if X Pixel is loaded and consent given
const canTrackXPixel = (): boolean => {
  if (typeof window === 'undefined' || !X_PIXEL_ID) {
    return false;
  }
  
  // Check if twq function exists and is not just a fallback
  if (!window.twq || typeof window.twq !== 'function') {
    return false;
  }
  
  // Check if it's a stub function (no exe property and no version or empty queue)
  // The real Twitter pixel will have exe property when loaded
  if (window.twq && !window.twq.exe) {
    // It's likely a stub function from ad blocker detection
    return false;
  }
  
  // Check for consent (if using consent management)
  try {
    const consent = localStorage.getItem('cookie-consent');
    if (consent) {
      const parsed = JSON.parse(consent);
      return parsed.marketing === true;
    }
  } catch (e) {
    // Ignore localStorage errors
  }
  
  return false;
};

// Download Event (Main Conversion)
export const trackXDownload = (location: string, version: string = 'latest') => {
  if (!canTrackXPixel()) return;
  
  try {
    const eventName = `tw-${X_PIXEL_ID}-${X_EVENTS.DOWNLOAD}`;
    window.twq('event', eventName, {
      contents: [{
        content_id: `vibe-manager-mac-${version}`,
        content_name: 'Vibe Manager Mac App',
        content_type: 'Software',
        num_items: 1
      }],
      value: 0, // Free download
      currency: 'USD',
      conversion_id: `download-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      description: `Download from ${location}`
    });
  } catch (error) {
    console.warn('X Pixel download tracking error:', error);
  }
};

// Page View Event (Currently inactive, but ready if you activate it)
export const trackXPageView = (pagePath?: string) => {
  if (!canTrackXPixel()) return;
  
  try {
    const eventName = `tw-${X_PIXEL_ID}-${X_EVENTS.PAGE_VIEW}`;
    window.twq('event', eventName, {
      page_location: pagePath || window.location.href,
      page_title: document.title
    });
  } catch (error) {
    console.warn('X Pixel page view tracking error:', error);
  }
};

// Lead Generation Event (Currently inactive, but ready if you activate it)
export const trackXLeadGeneration = (source: string) => {
  if (!canTrackXPixel()) return;
  
  try {
    const eventName = `tw-${X_PIXEL_ID}-${X_EVENTS.LEAD_GENERATION}`;
    window.twq('event', eventName, {
      value: 10, // Estimated lead value
      currency: 'USD',
      description: `Lead from ${source}`,
      conversion_id: `lead-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    });
  } catch (error) {
    console.warn('X Pixel lead generation tracking error:', error);
  }
};

// Add to Cart Event (Currently inactive, but ready if you activate it)
export const trackXAddToCart = (productName: string, value: number = 0) => {
  if (!canTrackXPixel()) return;
  
  try {
    const eventName = `tw-${X_PIXEL_ID}-${X_EVENTS.ADD_TO_CART}`;
    window.twq('event', eventName, {
      contents: [{
        content_id: productName,
        content_name: productName,
        content_type: 'Product',
        num_items: 1
      }],
      value: value,
      currency: 'USD',
      conversion_id: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    });
  } catch (error) {
    console.warn('X Pixel add to cart tracking error:', error);
  }
};

// Purchase Event (Currently inactive, but ready if you activate it)
export const trackXPurchase = (orderId: string, value: number, items: any[]) => {
  if (!canTrackXPixel()) return;
  
  try {
    const eventName = `tw-${X_PIXEL_ID}-${X_EVENTS.PURCHASE}`;
    window.twq('event', eventName, {
      value: value,
      currency: 'USD',
      order_id: orderId,
      contents: items,
      conversion_id: `purchase-${orderId}-${Date.now()}`
    });
  } catch (error) {
    console.warn('X Pixel purchase tracking error:', error);
  }
};

// Export the main download function for backward compatibility
export const trackXDownloadConversion = trackXDownload;