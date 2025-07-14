"use client";

import { useState } from "react";
import { User, LogOut, Trash2, Mail, Phone, MapPin, Shield, CreditCard, Settings } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";

import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader } from "@/ui/card";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/badge";
import { useNotification } from "@/contexts/notification-context";
import { openBillingPortal } from "@/actions/billing";
import { useBillingData } from "@/hooks/use-billing-data";

import { BillingDashboard } from "@/app/components/billing/BillingDashboard";
export default function AccountPage() {
  const { user, signOut } = useAuth();
  const { showNotification } = useNotification();
  const { customerBillingInfo: billingInfo, isLoading: billingLoading } = useBillingData();
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

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

  const handleUpdateBillingInfo = async () => {
    try {
      setIsOpeningPortal(true);
      const portalUrl = await openBillingPortal();
      await open(portalUrl);
    } catch (err) {
      console.error("Billing portal error:", err);
      showNotification({
        title: "Billing Portal Failed",
        message: "Failed to open billing portal. Please try again.",
        type: "error",
      });
    } finally {
      setIsOpeningPortal(false);
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
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Account</h1>
          <p className="text-muted-foreground text-lg">Manage your profile, billing, and account settings</p>
        </div>

        <Card className="bg-gradient-to-r from-card to-card/90 border-2 border-border/20 shadow-sm">
          <CardContent className="space-y-6">
            {/* User Profile Section */}
            <div className="space-y-4 pt-4 border-t border-border/50">
              <h3 className="text-xl font-bold flex items-center gap-3">
                <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                Account Information
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{user.name || "No name provided"}</p>
                    <p className="text-xs text-muted-foreground">Account Name</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium break-all">{user.email}</p>
                    <p className="text-xs text-muted-foreground">Account Email</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Billing Information Section */}
            <div className="space-y-4 pt-4 border-t border-border/50">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center gap-3">
                  <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-primary" />
                  </div>
                  Billing Information
                </h3>
                <Badge variant={billingInfo?.hasBillingInfo ? "default" : "secondary"}>
                  {billingInfo?.hasBillingInfo ? "Complete" : "Incomplete"}
                </Badge>
              </div>
              
              {billingLoading ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-muted rounded w-1/3"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                  <div className="h-3 bg-muted rounded w-1/4"></div>
                </div>
              ) : billingInfo ? (
                <div className="grid gap-6 sm:grid-cols-2">
                  {/* First Column: Contact Information */}
                  <div className="space-y-3">
                    {(billingInfo.customerEmail && billingInfo.customerEmail !== user.email) && (
                      <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium break-all">{billingInfo.customerEmail}</p>
                          <p className="text-xs text-muted-foreground">Billing Email</p>
                        </div>
                      </div>
                    )}

                    {billingInfo.phone && (
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{billingInfo.phone}</p>
                          <p className="text-xs text-muted-foreground">Phone Number</p>
                        </div>
                      </div>
                    )}

                    {billingInfo.taxExempt && billingInfo.taxExempt !== "none" && (
                      <div className="flex items-center gap-3">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">
                            {billingInfo.taxExempt === "exempt" 
                              ? "Tax Exempt" 
                              : billingInfo.taxExempt === "reverse" 
                                ? "Reverse Charge" 
                                : billingInfo.taxExempt}
                          </p>
                          <p className="text-xs text-muted-foreground">Tax Status</p>
                        </div>
                      </div>
                    )}

                    {billingInfo.taxIds && billingInfo.taxIds.length > 0 && (
                      <div className="flex items-start gap-3">
                        <Shield className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <div className="space-y-1">
                            {billingInfo.taxIds.map((taxId, index) => (
                              <div key={index} className="text-sm font-medium">
                                <span className="text-muted-foreground text-xs uppercase mr-2">
                                  {taxId.type}{taxId.country && ` (${taxId.country})`}:
                                </span>
                                <span>{taxId.value}</span>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground">Tax ID{billingInfo.taxIds.length > 1 ? 's' : ''}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Second Column: Address Information */}
                  <div className="space-y-3">
                    {(billingInfo.addressLine1 || billingInfo.addressCity || billingInfo.addressCountry) && (
                      <div className="flex items-start gap-3">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <div className="text-sm font-medium space-y-0.5">
                            {billingInfo.addressLine1 && <p>{billingInfo.addressLine1}</p>}
                            {billingInfo.addressLine2 && <p>{billingInfo.addressLine2}</p>}
                            <p>
                              {[billingInfo.addressCity, billingInfo.addressState, billingInfo.addressPostalCode]
                                .filter(Boolean)
                                .join(", ")}
                            </p>
                            {billingInfo.addressCountry && <p>{billingInfo.addressCountry}</p>}
                          </div>
                          <p className="text-xs text-muted-foreground">Billing Address</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No billing information on file. Billing details will appear after your first purchase.
                </p>
              )}
            </div>

            {/* Update Button */}
            <div className="pt-4 border-t border-border/50">
              <Button 
                onClick={handleUpdateBillingInfo}
                variant="outline"
                size="default"
                disabled={isOpeningPortal}
                className="w-full sm:w-auto px-4 py-2 font-medium"
              >
                {isOpeningPortal ? "Opening..." : "Update Billing Information"}
              </Button>
              {!billingInfo?.hasBillingInfo && (
                <p className="text-xs text-muted-foreground mt-2">
                  Complete your billing information to ensure uninterrupted service
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <BillingDashboard />

        <Card className="bg-gradient-to-r from-card to-card/90 border border-border/50 shadow-sm">
          <CardHeader className="pb-4">
            <h3 className="text-xl font-bold flex items-center gap-3">
              <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                <Settings className="h-5 w-5 text-primary" />
              </div>
              Account Management
            </h3>
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