"use client";

import { useState, useEffect } from "react";
import { User, LogOut, Trash2, Mail, Phone, MapPin, Shield, CreditCard, Settings, Globe } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";

import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader } from "@/ui/card";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/ui/select";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/ui/alert-dialog";
import { useNotification } from "@/contexts/notification-context";
import { openBillingPortal } from "@/actions/billing";
import { useBillingData } from "@/hooks/use-billing-data";
import type { ServerRegionInfo } from "@/types/tauri-commands";

import { BillingDashboard } from "@/app/components/billing/BillingDashboard";
export default function AccountPage() {
  const { user, signOut } = useAuth();
  const { showNotification } = useNotification();
  const { customerBillingInfo: billingInfo, isLoading: billingLoading } = useBillingData();
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  
  // Region management state
  const [availableRegions, setAvailableRegions] = useState<ServerRegionInfo[]>([]);
  const [currentRegion, setCurrentRegion] = useState<string | null>(null);
  const [pendingRegion, setPendingRegion] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isLoadingRegions, setIsLoadingRegions] = useState(true);
  const [isChangingRegion, setIsChangingRegion] = useState(false);

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

  // Region management handlers
  const handleRegionChange = (newRegionUrl: string) => {
    setPendingRegion(newRegionUrl);
    setShowConfirmDialog(true);
  };

  const handleConfirmRegionChange = async () => {
    if (!pendingRegion) return;
    
    try {
      setIsChangingRegion(true);
      await invoke("change_server_url_and_reset_command", { newUrl: pendingRegion });
      
      showNotification({
        title: "Region Changed",
        message: "Server region has been changed successfully. You will be signed out.",
        type: "success",
      });
      
      // The command should handle logout, but we'll try to sign out gracefully
      try {
        await signOut();
      } catch {
        // Ignore signout errors as the reset command should handle this
      }
    } catch (err) {
      console.error("Region change error:", err);
      showNotification({
        title: "Region Change Failed",
        message: "Failed to change server region. Please try again.",
        type: "error",
      });
    } finally {
      setIsChangingRegion(false);
      setShowConfirmDialog(false);
      setPendingRegion(null);
    }
  };

  const handleCancelRegionChange = () => {
    setShowConfirmDialog(false);
    setPendingRegion(null);
  };

  // Fetch regions on component mount
  useEffect(() => {
    const fetchRegions = async () => {
      try {
        setIsLoadingRegions(true);
        const [regions, currentUrl] = await Promise.all([
          invoke("get_available_regions_command", {}),
          invoke("get_selected_server_url_command", {})
        ]);
        
        setAvailableRegions(regions);
        setCurrentRegion(currentUrl);
      } catch (err) {
        console.error("Failed to fetch regions:", err);
        showNotification({
          title: "Region Loading Failed",
          message: "Failed to load available regions.",
          type: "error",
        });
      } finally {
        setIsLoadingRegions(false);
      }
    };

    fetchRegions();
  }, [showNotification]);

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

            {/* Server Region Section */}
            <div className="space-y-4 pt-4 border-t border-border/50">
              <h3 className="text-xl font-bold flex items-center gap-3">
                <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                  <Globe className="h-5 w-5 text-primary" />
                </div>
                Server Region
              </h3>
              
              {isLoadingRegions ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-muted rounded w-1/3"></div>
                  <div className="h-10 bg-muted rounded w-full"></div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Current Region</p>
                      <p className="text-xs text-muted-foreground">
                        Choose the server region closest to you for optimal performance
                      </p>
                    </div>
                  </div>
                  
                  <Select 
                    value={currentRegion || ""} 
                    onValueChange={handleRegionChange}
                    disabled={isChangingRegion}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a region..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRegions.map((region) => (
                        <SelectItem key={region.url} value={region.url}>
                          {region.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {availableRegions.length === 0 && !isLoadingRegions && (
                    <p className="text-sm text-muted-foreground">
                      No regions available. Please check your connection and try again.
                    </p>
                  )}
                </div>
              )}
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
                  {billingInfo?.hasBillingInfo ? "Complete" : "Setup Required"}
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
                                  {taxId.type_}{taxId.country && ` (${taxId.country})`}:
                                </span>
                                <span>{taxId.value}</span>
                                {taxId.verificationStatus && (
                                  <Badge 
                                    variant={
                                      taxId.verificationStatus === 'verified' ? 'default' :
                                      taxId.verificationStatus === 'pending' ? 'secondary' :
                                      'destructive'
                                    }
                                    className="ml-2"
                                  >
                                    {taxId.verificationStatus}
                                  </Badge>
                                )}
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
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    No billing information on file yet.
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    Please set up your billing information to enable credit purchases and access all features.
                  </p>
                </div>
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
                {isOpeningPortal ? "Opening..." : billingInfo?.hasBillingInfo ? "Update Billing Information" : "Set Up Billing Information"}
              </Button>
              {!billingInfo?.hasBillingInfo && (
                <p className="text-xs text-muted-foreground mt-2">
                  Complete your billing information to enable purchases and ensure uninterrupted service
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

      {/* Region Change Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Region Change</AlertDialogTitle>
            <AlertDialogDescription>
              Changing your server region will sign you out of your account and reset your local session data. 
              You will need to sign in again after the change is complete.
              {pendingRegion && availableRegions.length > 0 && (
                <>
                  <br /><br />
                  <strong>
                    New region: {availableRegions.find(r => r.url === pendingRegion)?.label || 'Unknown'}
                  </strong>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={handleCancelRegionChange}
              disabled={isChangingRegion}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmRegionChange}
              disabled={isChangingRegion}
            >
              {isChangingRegion ? "Changing Region..." : "Change Region"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}