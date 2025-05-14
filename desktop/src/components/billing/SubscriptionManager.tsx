/**
 * Subscription Manager Component
 * 
 * Displays subscription information and provides options to manage subscriptions.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/auth/auth-context';
import { getToken } from '@/auth/token-storage';

// Server URL from environment variables
const SERVER_URL = import.meta.env.SERVER_URL || 'http://localhost:8080';

interface SubscriptionInfo {
  plan: string;
  status: string;
  trialEndsAt?: string;
  currentPeriodEndsAt?: string;
  usage: {
    tokensInput: number;
    tokensOutput: number;
    totalCost: number;
  };
}

export default function SubscriptionManager() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load subscription info
  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        setLoading(true);
        setError(null);

        const token = await getToken();
        if (!token) {
          throw new Error('Authentication token not found');
        }

        const response = await fetch(`${SERVER_URL}/api/billing/subscription`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch subscription: ${response.statusText}`);
        }

        const data = await response.json();
        setSubscription(data);
      } catch (err) {
        console.error('Failed to load subscription:', err);
        setError('Failed to load subscription information');
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchSubscription();
    }
  }, [user]);

  // Handle subscription upgrade
  const handleUpgrade = async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication token not found');
      }

      const response = await fetch(`${SERVER_URL}/api/billing/checkout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ plan: 'pro' })
      });

      if (!response.ok) {
        throw new Error(`Failed to create checkout session: ${response.statusText}`);
      }

      const { url } = await response.json();
      
      // Open the URL in the default browser
      await window.__TAURI__.shell.open(url);
    } catch (err) {
      console.error('Failed to start checkout process:', err);
      setError('Failed to start checkout process');
    }
  };

  // Handle managing subscription
  const handleManageSubscription = async () => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication token not found');
      }

      const response = await fetch(`${SERVER_URL}/api/billing/portal`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to create portal session: ${response.statusText}`);
      }

      const { url } = await response.json();
      
      // Open the URL in the default browser
      await window.__TAURI__.shell.open(url);
    } catch (err) {
      console.error('Failed to open customer portal:', err);
      setError('Failed to open customer portal');
    }
  };

  if (loading) {
    return (
      <div className="p-4 bg-background rounded-lg border border-border">
        <div className="animate-pulse h-6 w-32 bg-muted rounded mb-4"></div>
        <div className="animate-pulse h-4 w-24 bg-muted rounded mb-2"></div>
        <div className="animate-pulse h-4 w-40 bg-muted rounded mb-4"></div>
        <div className="animate-pulse h-10 w-full bg-muted rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive">
        <h3 className="font-medium mb-2">Error</h3>
        <p className="text-sm">{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-2 px-4 py-2 bg-destructive text-destructive-foreground rounded text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="p-4 bg-background rounded-lg border border-border">
        <h3 className="font-medium mb-2">Subscription</h3>
        <p className="text-sm text-muted-foreground mb-4">No subscription information available.</p>
        <button 
          onClick={handleUpgrade} 
          className="w-full px-4 py-2 bg-primary text-primary-foreground rounded text-sm"
        >
          Upgrade to Pro
        </button>
      </div>
    );
  }

  const isTrialing = subscription.status === 'trialing';
  const isCancelled = subscription.status === 'canceled';
  const isActive = subscription.status === 'active';
  
  return (
    <div className="p-4 bg-background rounded-lg border border-border">
      <h3 className="font-medium mb-4">Subscription</h3>
      
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-muted-foreground">Plan</span>
          <span className="font-medium">{subscription.plan.toUpperCase()}</span>
        </div>
        
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-muted-foreground">Status</span>
          <span className={`font-medium ${isActive ? 'text-green-500' : isCancelled ? 'text-red-500' : ''}`}>
            {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
          </span>
        </div>
        
        {isTrialing && subscription.trialEndsAt && (
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">Trial ends</span>
            <span className="font-medium">{new Date(subscription.trialEndsAt).toLocaleDateString()}</span>
          </div>
        )}
        
        {isActive && subscription.currentPeriodEndsAt && (
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">Renews on</span>
            <span className="font-medium">{new Date(subscription.currentPeriodEndsAt).toLocaleDateString()}</span>
          </div>
        )}
      </div>
      
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2">Usage This Month</h4>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-muted-foreground">Input tokens</span>
          <span className="font-medium">{subscription.usage.tokensInput.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-muted-foreground">Output tokens</span>
          <span className="font-medium">{subscription.usage.tokensOutput.toLocaleString()}</span>
        </div>
        {subscription.plan !== 'free' && (
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">Cost</span>
            <span className="font-medium">${subscription.usage.totalCost.toFixed(2)}</span>
          </div>
        )}
      </div>
      
      <div className="space-y-2">
        {subscription.plan === 'free' ? (
          <button 
            onClick={handleUpgrade} 
            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded text-sm"
          >
            Upgrade to Pro
          </button>
        ) : (
          <button 
            onClick={handleManageSubscription} 
            className="w-full px-4 py-2 bg-secondary text-secondary-foreground rounded text-sm"
          >
            Manage Subscription
          </button>
        )}
      </div>
    </div>
  );
}