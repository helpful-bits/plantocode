Stripe should sit **immediately after your cost-calculator has decided “how many billable units did this customer just burn?”**
Your calculator stays the source of truth for raw token counts and unit-price decisions, while Stripe becomes the *system-of-record* for:

* persisting usage events,
* keeping the \$20 monthly allowance (credit grant) in sync with the meter,
* generating & collecting invoices (either at period-end or when a billing-threshold fires).

Below is a step-by-step technical map of where each Stripe API call belongs in that pipeline.

---

## 1 Processing pipeline at a glance

| Step                        | Runs inside…    | What happens                                                                                                                                                                        |
| --------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. LLM call finishes**    | Your app        | You emit: `customer_id`, `tokens_in`, `tokens_out`, `ts`                                                                                                                            |
| **B. Cost calculator**      | Central service | 1) Converts tokens → billable *units* (e.g., “1 unit per 1 million tokens”)  2) Adds markup                                                                                               |
| **C. Post usage to Stripe** | Calculator      | `POST /v1/usage_events` (or `/usage_records`) with `meter`, `customer`, `quantity`, optional `timestamp` ([docs.stripe.com][1])                                                     |
| **D. Stripe aggregation**   | Stripe          | Meter rolls up events per `aggregation_method` (“sum” for tokens) ([docs.stripe.com][2])                                                                                            |
| **E. Credits & thresholds** | Stripe          | \$20 **Credit Grant** issued on each renewal is decremented first; if exhausted and `billing_thresholds` crossed, Stripe auto-invoices ([docs.stripe.com][3], [docs.stripe.com][4]) |
| **F. Payment collection**   | Stripe          | Stripe finalises invoice, charges default payment method, sends webhooks (`invoice.paid`, etc.)                                                                                     |
| **G. Entitlement sync**     | Your backend    | Listen to webhooks, unlock/lock features                                                                                                                                            |

Only steps **B** and **C** run inside your cost-calculator; the rest is fully managed by Stripe.

---

## 2 Stripe objects you must pre-create

| Object                                                                                                                                                                          | Configuration notes |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **Product** “LLM usage” and **Price** #1 (licensed) → `$20 / month` ([docs.stripe.com][3])                                                                                      |                     |
| **Price** #2 (metered) → `$2.00 per 1 million tokens`, attach a **Meter** whose `aggregation_method` =`sum` ([docs.stripe.com][2])                                                   |                     |
| **Subscription** containing both prices; add `billing_cycle_anchor` =`now` and (optionally) `billing_thresholds` in money or units ([docs.stripe.com][5], [docs.stripe.com][4]) |                     |
| **Credit Grant Rule** → issues `amount=20 USD` on every renewal and applies *only* to the metered price ([docs.stripe.com][3], [docs.stripe.com][6])                            |                     |

---

## 3 Posting usage from the calculator

```bash
curl -u sk_test: https://api.stripe.com/v1/usage_events \
 -d meter=mtr_AlpacaTokens \
 -d customer=cus_123 \
 -d quantity=15          # e.g. 15 million tokens → 15 “units” if your price is per 1 million
 -d timestamp=1729537362 # optional; defaults to now
 -d idempotency_key=op_987654321
```

Key points:

* **Batching** – you may bundle multiple requests into one usage event to stay under the 1 000 req/s rate limit ([docs.stripe.com][1]).
* **Idempotency** – include an `idempotency_key` to make replays safe.
* **Late events** – Stripe accepts timestamps up to 24 h in the past to handle retries.

---

## 4 How the \$20 allowance burns down

1. On renewal, a **Credit Grant** of `$20` is created and linked to the customer account ([docs.stripe.com][3]).
2. Each usage event reduces the *credit balance* before it ever touches cash.
3. When the balance is `0` **and** accumulated overage ≥ your `billing_thresholds` rule, Stripe produces an invoice immediately; otherwise usage accrues until the period ends ([docs.stripe.com][4]).

> You don’t need custom logic in the calculator to check the remaining allowance—Stripe handles it.

---

## 5 Optional knobs for invoice timing

| Feature                                         | When to use it                    | API field                                                              |
| ----------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| **Automatic top-off** after X \$ / units        | Fire an invoice mid-cycle         | `billing_thresholds` on subscription or item ([docs.stripe.com][4])    |
| **Force sweep of one-off top-ups** every N days | Bill manual credit sales promptly | `pending_invoice_item_interval` on subscription ([docs.stripe.com][7]) |
| **Preview cost before top-off**                 | Show “You’ll be charged \$7.31”   | `POST /v1/invoices/upcoming` ([docs.stripe.com][8])                    |

---

## 6 Webhooks your backend should consume

| Event                           | Why listen                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `invoice.finalized`             | Freeze token access until paid if you choose                                     |
| `invoice.paid`                  | Restore credit balance (Stripe does this automatically, but you might update UI) |
| `customer.subscription.updated` | Detect plan upgrades/downgrades                                                  |

All come through the normal Events API, nothing special for meters ([docs.stripe.com][9]).

---

## 7 Bulk or offline ingestion

If your calculator stores raw logs and uploads once a day, push a **CSV to an S3 bucket** or call the bulk API—Stripe parses it into usage events the same way ([docs.stripe.com][10]).

---

## 8 End-to-end sequence diagram (textual)

```
App ──► Calculator ──►  /v1/usage_events ─┐
                                         │
                      webhook:invoice.* ◄┘
```

Stripe’s ledger always contains *every* usage event; your calculator only needs to forward quantities. All credit depletion, threshold checks, invoicing, and payment retries happen inside Stripe’s infrastructure.

---

### Key take-away

Your **calculator remains the place where you translate raw token counts into billable “units”**; the very next line in the flow is a `usage_events` (or `usage_records`) call to Stripe. From that point forward Stripe carries all monetary state—allowance burn-down, threshold-triggered invoices, credit top-ups, and payment collection—so your app never has to reason about remaining balance or billing dates.

[1]: https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api?utm_source=chatgpt.com "Record usage for billing with the API - Stripe Documentation"
[2]: https://docs.stripe.com/billing/subscriptions/usage-based/meters/create?utm_source=chatgpt.com "Create meters - Stripe Documentation"
[3]: https://docs.stripe.com/billing/subscriptions/usage-based/billing-credits/implementation-guide?utm_source=chatgpt.com "Set up billing credits | Stripe Documentation"
[4]: https://docs.stripe.com/billing/subscriptions/usage-based/thresholds?utm_source=chatgpt.com "Set up thresholds | Stripe Documentation"
[5]: https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-legacy-usage-based-billing?utm_source=chatgpt.com "Removes legacy usage-based billing - Stripe Documentation"
[6]: https://docs.stripe.com/api/billing/credit-grant?utm_source=chatgpt.com "Credit Grant | Stripe API Reference"
[7]: https://docs.stripe.com/billing/invoices/subscription?utm_source=chatgpt.com "Subscription invoices - Stripe Documentation"
[8]: https://docs.stripe.com/api/invoices/create_preview?utm_source=chatgpt.com "Create a preview invoice | Stripe API Reference"
[9]: https://docs.stripe.com/api/events?utm_source=chatgpt.com "Events | Stripe API Reference"
[10]: https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-in-bulk?utm_source=chatgpt.com "Record usage for billing using Amazon S3 - Stripe Documentation"
