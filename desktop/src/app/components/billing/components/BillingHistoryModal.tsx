import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/ui/dialog";
import { BillingHistory } from "./BillingHistory";

export interface BillingHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BillingHistoryModal({ open, onOpenChange }: BillingHistoryModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[75vh] min-h-[500px] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4">
          <DialogTitle>Billing History</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 flex flex-col px-6 pb-6">
          <BillingHistory isInModal={true} />
        </div>
      </DialogContent>
    </Dialog>
  );
}