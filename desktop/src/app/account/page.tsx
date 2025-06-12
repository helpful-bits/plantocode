"use client";

import { User, LogOut, Trash2 } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader } from "@/ui/card";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/badge";
import { useNotification } from "@/contexts/notification-context";

import { BillingDashboard } from "@/app/components/billing/BillingDashboard";

/**
 * Modern Account Page (2025 Design Patterns)
 * 
 * Architecture:
 * 1. User Profile - Clean presentation of user info
 * 2. Subscription & Billing - Single comprehensive section (ComprehensiveBillingDashboard)
 * 3. Account Actions - Security and account management
 * 
 * Principles:
 * - No duplication: ComprehensiveBillingDashboard is single source of truth for billing
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
            <div className="text-center py-8">
              <p className="text-muted-foreground leading-relaxed">Please sign in to view your account information.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 pt-6 pb-8 max-w-4xl">
      <div className="content-spacing">
        {/* Page Header - Modern, minimal */}
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Account</h1>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">Manage your profile and subscription</p>
        </div>

        {/* User Profile Section - Clean, focused */}
        <Card className="border border-border/50 bg-card/80 backdrop-blur-sm hover-card">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <h3 className="font-medium text-base sm:text-lg leading-tight break-words">
                  {user.name || user.email}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed break-all">
                  {user.email}
                </p>
              </div>
              <Badge variant="secondary" className="text-xs px-3 py-1.5 self-start sm:self-auto">
                {user.role === 'user' ? 'User' : user.role}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Subscription & Billing - Single source of truth */}
        <BillingDashboard />

        {/* Account Actions - Separated, clean */}
        <Card className="border border-border/50 bg-card/80 backdrop-blur-sm hover-card">
          <CardHeader className="pb-4">
            <h3 className="font-medium text-base">Account Actions</h3>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              <Button 
                onClick={handleSignOut}
                variant="outline"
                size="sm"
                className="w-full justify-start h-10 text-sm"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
              <Button 
                onClick={() => {
                  // TODO: Implement delete account functionality
                  showNotification({
                    title: "Feature Coming Soon",
                    message: "Account deletion will be available in a future update.",
                    type: "info",
                  });
                }}
                variant="destructive"
                size="sm"
                className="w-full justify-start h-10 text-sm"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}