import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Loader2 } from "lucide-react";
import {
  portalInitiatePayment,
  submitGatewayForm,
  type PaymentFeeType,
  type PaymentGateway,
} from "../api";

export default function PayOnlineButtons({
  feeType,
  amount,
  enablePayfast = true,
  enableJazzcash = true,
}: {
  feeType: PaymentFeeType;
  amount: number;
  enablePayfast?: boolean;
  enableJazzcash?: boolean;
}) {
  const { toast } = useToast();
  const [pending, setPending] = useState<PaymentGateway | null>(null);

  // If both methods are disabled, render nothing
  if (!enablePayfast && !enableJazzcash) return null;

  async function pay(gateway: PaymentGateway) {
    setPending(gateway);
    try {
      const checkout = await portalInitiatePayment(feeType, gateway);
      submitGatewayForm(checkout);
    } catch (err) {
      toast({
        title: "Could not start payment",
        description: err instanceof Error ? err.message : "Please try again or use bank transfer.",
        variant: "destructive",
      });
      setPending(null);
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <CreditCard className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-bold">Pay Online</h3>
      </div>
      <p className="text-sm text-foreground/60">
        Pay your fee of <strong>PKR {amount.toLocaleString()}</strong> instantly with debit/credit card or
        mobile wallet. You'll be redirected to a secure payment page.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {enablePayfast && (
          <Button
            type="button"
            onClick={() => pay("payfast")}
            disabled={pending !== null}
            className="bg-primary hover:bg-primary/90"
          >
            {pending === "payfast" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Pay with PayFast
          </Button>
        )}
        {enableJazzcash && (
          <Button
            type="button"
            onClick={() => pay("jazzcash")}
            disabled={pending !== null}
            variant="outline"
            className="border-primary text-primary hover:bg-primary/5"
          >
            {pending === "jazzcash" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Pay with JazzCash
          </Button>
        )}
      </div>
      <p className="text-xs text-foreground/50">
        {enablePayfast && "Cards & wallets via PayFast (Bank Alfalah). "}
        {enableJazzcash && "JazzCash / Easypaisa via JazzCash."}
      </p>
    </div>
  );
}
