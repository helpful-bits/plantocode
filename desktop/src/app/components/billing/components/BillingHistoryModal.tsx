import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/ui/dialog";
import { BillingHistory } from "./BillingHistory";

export interface BillingHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BillingHistoryModal({ open, onOpenChange }: BillingHistoryModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Billing & Usage History</DialogTitle>
        </DialogHeader>
        <BillingHistory />
      </DialogContent>
    </Dialog>
  );
}