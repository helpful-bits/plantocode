"use client";

import { User, LogOut } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader } from "@/ui/card";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/badge";
import { useNotification } from "@/contexts/notification-context";

import SubscriptionManager from "@/app/components/billing/subscription-manager";

/**
 * Modern Account Page (2025 Design Patterns)
 * 
 * Architecture:
 * 1. User Profile - Clean presentation of user info
 * 2. Subscription & Billing - Single comprehensive section (SubscriptionManager)
 * 3. Account Actions - Security and account management
 * 
 * Principles:
 * - No duplication: SubscriptionManager is single source of truth for billing
 * - Clear hierarchy: Profile → Billing → Actions
 * - Single responsibility: Each section handles one concern
 */
export default function AccountPage() {
  const { user, signOut } = useAuth();
  const { showNotification } = useNotification();

  const handleSignOut = async () => {
    try {
      await signOut();
      showNotification({
        title: "Signed Out", 
        message: "You have been successfully signed out.",
        type: "success",
      });
    } catch (err) {
      console.error("Sign out error:", err);
      showNotification({
        title: "Sign Out Failed",
        message: "Failed to sign out. Please try again.",
        type: "error",
      });
    }
  };

  if (!user) {
    return (
      <div className="container mx-auto px-6 pt-8 pb-8 max-w-2xl">
        <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-muted-foreground">Please sign in to view your account information.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 pt-8 pb-8 max-w-2xl">
      <div className="space-y-8">
        {/* Page Header - Modern, minimal */}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
          <p className="text-sm text-muted-foreground">Manage your profile and subscription</p>
        </div>

        {/* User Profile Section - Clean, focused */}
        <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-base truncate">
                  {user.name || user.email}
                </h3>
                <p className="text-sm text-muted-foreground truncate">
                  {user.email}
                </p>
              </div>
              <Badge variant="secondary" className="text-xs px-2 py-1">
                {user.role === 'user' ? 'User' : user.role}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Subscription & Billing - Single source of truth */}
        <SubscriptionManager />

        {/* Account Actions - Separated, clean */}
        <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <h3 className="font-medium text-sm">Account Actions</h3>
          </CardHeader>
          <CardContent className="pt-0">
            <Button 
              onClick={handleSignOut}
              variant="outline"
              size="sm"
              className="w-full justify-start h-9"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}