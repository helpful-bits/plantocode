"use client";

import { User, LogOut, Trash2 } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader } from "@/ui/card";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/badge";
import { useNotification } from "@/contexts/notification-context";

import { BillingDashboard } from "@/app/components/billing/BillingDashboard";
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
    <div className="container mx-auto px-4 sm:px-6 pt-6 pb-8 max-w-5xl">
      <div className="space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">Account</h1>
          <p className="text-muted-foreground text-lg">Manage your profile, billing, and account settings</p>
        </div>

        <Card className="bg-gradient-to-r from-card to-card/90 border-2 border-border/20 shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <div className="h-16 w-16 bg-primary/15 rounded-full flex items-center justify-center flex-shrink-0 ring-4 ring-primary/10">
                <User className="h-8 w-8 text-primary" />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <h2 className="font-semibold text-xl leading-tight break-words">
                  {user.name || user.email}
                </h2>
                <p className="text-muted-foreground break-all">
                  {user.email}
                </p>
              </div>
              <Badge variant="secondary" className="px-4 py-2 font-medium self-start sm:self-auto">
                {user.role === 'user' ? 'User Account' : user.role}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <BillingDashboard />

        <Card className="bg-gradient-to-r from-card to-card/90 border border-border/50 shadow-sm">
          <CardHeader className="pb-4">
            <h3 className="font-semibold text-lg">Account Management</h3>
            <p className="text-sm text-muted-foreground">Manage your account security and data</p>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid gap-3 sm:grid-cols-2">
              <Button 
                onClick={handleSignOut}
                variant="outline"
                size="default"
                className="justify-start font-medium"
              >
                <LogOut className="h-4 w-4 mr-3" />
                Sign Out
              </Button>
              <Button 
                onClick={() => {
                  showNotification({
                    title: "Feature Coming Soon",
                    message: "Account deletion will be available in a future update.",
                    type: "info",
                  });
                }}
                variant="destructive"
                size="default"
                className="justify-start font-medium"
              >
                <Trash2 className="h-4 w-4 mr-3" />
                Delete Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}