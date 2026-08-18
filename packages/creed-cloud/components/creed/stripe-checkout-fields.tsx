"use client";

import { useState } from "react";
import {
  ExpressCheckoutElement,
  PaymentElement,
} from "@stripe/react-stripe-js";
import type { StripeExpressCheckoutElementConfirmEvent } from "@stripe/stripe-js";

// Wallet buttons live in Express Checkout. Payment Element wallets stay off so
// Apple Pay and Google Pay are not duplicated under the card fields.
// The Express Checkout host must stay laid out on first mount. display:none
// prevents Payment Request from seeing Apple Pay. applePay/googlePay "always"
// is required for the buttons to show on Chrome as well as Safari.

export function StripeCheckoutFields({
  applePayButtonType,
  googlePayButtonType,
  onExpressConfirm,
}: {
  applePayButtonType: "contribute" | "donate" | "top-up";
  googlePayButtonType: "donate" | "pay";
  onExpressConfirm: (
    event: StripeExpressCheckoutElementConfirmEvent
  ) => void | Promise<void>;
}) {
  const [hasWallets, setHasWallets] = useState(true);

  return (
    <div className="space-y-4">
      <div className={hasWallets ? undefined : "invisible h-0 overflow-hidden"}>
        <ExpressCheckoutElement
          options={{
            buttonType: {
              applePay: applePayButtonType,
              googlePay: googlePayButtonType,
            },
            layout: { maxColumns: 1, maxRows: 2, overflow: "never" },
            paymentMethodOrder: ["apple_pay", "google_pay"],
            paymentMethods: {
              amazonPay: "never",
              applePay: "always",
              googlePay: "always",
              link: "never",
              paypal: "never",
            },
          }}
          onClick={(event) => {
            event.resolve();
          }}
          onAvailablePaymentMethodsChange={(event) => {
            setHasWallets(Boolean(event.paymentMethods));
          }}
          onConfirm={onExpressConfirm}
        />
      </div>
      <PaymentElement
        options={{
          wallets: { applePay: "never", googlePay: "never" },
        }}
      />
    </div>
  );
}
