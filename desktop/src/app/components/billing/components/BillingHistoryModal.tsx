import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/ui/dialog";
import { BillingHistory } from "./BillingHistory";

export interface BillingHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BillingHistoryModal({ open, onOpenChange }: BillingHistoryModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Billing History</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden">
          <BillingHistory className="h-full" />
        </div>
      </DialogContent>
    </Dialog>
  );
}