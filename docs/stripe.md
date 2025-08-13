# Goal

Turn on **correct automatic tax** for a German GmbH selling **software/API usage credits** (desktop app + in‑app credits) worldwide, while you keep **filings with your accountant**.

> Important: You **do not** need a separate VAT registration in every EU country for cross‑border **B2C** sales of digital services. Use **Union OSS** from Germany to cover all other EU countries. (You still keep your normal German domestic VAT.)

---

## Q. Launch NOW while OSS is pending (zero‑sales starter plan)

**Context:** OSS is not active yet. You have **0 sales so far** (below the EU €10,000 micro‑threshold). Goal: **start selling today** legally, then upgrade to the “proper” multi‑region setup as approvals arrive.

### Q1 — What you can sell **today** (and how Stripe will tax)

* **Germany (DE):** charge **German VAT** → add **Germany – Domestic** in Stripe.
* **EU B2C (outside DE):** while you’re **≤ €10,000** cross‑border B2C, you **may charge German VAT** (supplier‑country rule). Don’t add OSS yet. When OSS is approved, switch to **customer‑country VAT**.
* **EU B2B:** collect **VAT IDs**; apply **Reverse Charge (0%)** automatically via Stripe.
* **United Kingdom (UK):** **Do not** sell **B2C** until you have a **GB VAT** number (nil threshold). You may sell **B2B** with GB VAT ID (reverse‑charge). Temporarily **block UK** at checkout via **Radar**, and allow specific B2B customers via an allow‑list.
* **United States:** you can sell with **\$0 tax** until you register in a state (don’t collect before you have a permit). Add states later as you trigger **nexus**.
* **Canada:** you can sell with **\$0 tax** until you cross **CAD \$30,000** in 12 months (then register for **GST/HST**, and provinces as needed).

### Q2 — 60‑minute kick‑off (copy‑paste API)

```bash
# 1) Turn on sane defaults (DE head office, SaaS tax code)
curl https://api.stripe.com/v1/tax/settings -u sk_live_xxx: \
  -d defaults[tax_behavior]=exclusive \
  -d defaults[tax_code]=txcd_10103001 \
  -d head_office[address][country]=DE

# 2) Put your DE VAT ID on invoices
curl https://api.stripe.com/v1/tax_ids -u sk_live_xxx: -d type=eu_vat -d value=DE348790234

# 3) Add Germany (Domestic) — this makes DE VAT apply today
curl https://api.stripe.com/v1/tax/registrations -u sk_live_xxx: \
  -d country=DE -d country_options[de][type]=standard -d active_from=now

# 4) Checkout that actually calculates tax + collects VAT IDs
curl https://api.stripe.com/v1/checkout/sessions -u sk_live_xxx: \
  -d mode=payment \
  -d success_url="https://example.com/success" -d cancel_url="https://example.com/cancel" \
  -d automatic_tax[enabled]=true -d billing_address_collection=required \
  -d tax_id_collection[enabled]=true -d customer_update[address]=auto \
  -d "line_items[0][price]"=price_xxx -d "line_items[0][quantity]"=1

# 5) TEMP: Block UK until GB VAT is active (allow select B2B exceptions)
# Create an allow-list for specific B2B emails (edit)
curl https://api.stripe.com/v1/radar/value_lists -u sk_live_xxx: \
  -d name="UK B2B allow" -d alias=uk_b2b_allow -d item_type=email
# Example allow entries
for E in buyer1@customer.com buyer2@company.co.uk; do \
  curl https://api.stripe.com/v1/radar/value_list_items -u sk_live_xxx: -d value=$E -d value_list=@uk_b2b_allow; \
  echo; \
done
# Rule to block UK by default; allow listed B2B
# (Add in Dashboard ▸ Radar ▸ Rules)
# if :billing_country = 'GB' and :email not in @uk_b2b_allow then block
```

### Q3 — This week (apply for the missing pieces)

* **Submit**: **DE OSS** (Union) in the German portal; **GB VAT** with HMRC.
* **US/CA**: nothing to file yet; set up **Stripe Tax → Monitoring** to watch thresholds.
* Keep selling **DE**, **EU B2B**, and **EU B2C under €10k** (charged with **DE VAT**). Keep **UK B2C blocked**.

### Q4 — When approvals arrive (flip the switches)

* **OSS approved** → add **EU → Union OSS** in Stripe (API below). From that date onward, Stripe will charge **customer‑country VAT** for EU B2C. Prior sales remain under DE VAT.

```bash
curl https://api.stripe.com/v1/tax/registrations -u sk_live_xxx: \
  -d country=DE -d country_options[de][type]=oss_union -d active_from=YYYY-MM-DD
```

* **GB VAT number issued** → add **United Kingdom → standard** in Stripe, then **remove the UK block rule**.

```bash
curl https://api.stripe.com/v1/tax/registrations -u sk_live_xxx: \
  -d country=GB -d country_options[gb][type]=standard -d active_from=YYYY-MM-DD
```

* **US state threshold hit** → register with that **state DOR**, then add the **state** in Stripe (one per state). Continue to add states as you expand.

```bash
curl https://api.stripe.com/v1/tax/registrations -u sk_live_xxx: \
  -d country=US -d country_options[us][state]=CA -d country_options[us][type]=state_sales_tax -d active_from=YYYY-MM-DD
```

* **Canada threshold hit (CAD \$30k)** → add **CA GST/HST** (and provinces as needed) in Stripe.

### Q5 — Track the EU €10k micro‑threshold (while OSS pending)

* **Stripe Tax → Monitoring** highlights EU cross‑border exposure.
* As soon as you approach **€10,000** (current + previous year), **stop** using DE VAT for EU B2C and wait for **OSS** (or rush the OSS approval). After OSS is live, all new EU B2C invoices will charge customer‑country VAT.

---

## O. Per‑state breakdown (reports & API)

**Goal:** See your **sales and tax** totals **per US state** (and Canada by province).

**Option 1 — Dashboard (quick view):**

* Go to **Tax → Reports → Location reports**. Pick **United States** (or **Canada**) and a period. You’ll see totals aggregated **per location**. (View‑only; can’t download.)

**Option 2 — Downloadable CSV via Reports API (recommended):**

* Run the **Tax itemized report** and group in a spreadsheet by the `state_code` column. This report already includes `filing_taxable_amount`, `filing_tax_amount`, and `filing_total`.

```bash
# Create a report run for a date range (example: July 2025)
curl https://api.stripe.com/v1/reporting/report_runs -u $STRIPE_SECRET_KEY: \
  -d report_type=tax.transactions.itemized.2 \
  -d parameters[interval_start]=2025-07-01 \
  -d parameters[interval_end]=2025-07-31 \
  -d parameters[timezone]=Europe/Berlin

# -> Note the returned report_run.id and file.id, then download the file
curl -G https://api.stripe.com/v1/files/{file_id}/contents -u $STRIPE_SECRET_KEY: -o tax_itemized_jul_2025.csv
```

**How to use it:** Pivot or SUM the CSV by `state_code` (filter `country_code = US`).

**Option 3 — Stripe Data (SQL, most flexible):**

* Use the **Tax** schema to aggregate by **state jurisdiction** directly.

```sql
-- US state‑level tax collected for July 2025 (filing currency)
select
  jd.jurisdiction_state as state,
  sum(jd.filing_amount_taxable) as filing_taxable_amount,
  sum(jd.filing_amount_tax)     as filing_tax_amount
from tax_transaction_jurisdiction_details jd
where jd.jurisdiction_country = 'US'
  and jd.jurisdiction_level = 'state'
  and jd.posted_at >= '2025-07-01' and jd.posted_at < '2025-08-01'
group by 1
order by 1;
```

**Notes**

* The **itemized report** includes both taxable and non‑taxable rows; filter out non‑taxable if you only want collected tax.
* **Location reports** are aligned to each location’s **filing period** conventions (for the US and Canada).
* You can also **click into any tax transaction** in the Dashboard to see its **jurisdiction breakdown** (state/county/city) for debugging.

---

## J. Imprint (Impressum) — helpful bits GmbH

> Hinweis: Die bisherigen Verweise auf **§ 5 TMG** sind seit 2024 zu **§ 5 DDG (Digitale-Dienste-Gesetz)** geworden. Es besteht keine Pflicht, den Paragrafen im Wortlaut zu nennen; wenn Sie ihn nennen, bitte **§ 5 DDG** verwenden.

**Company / Anbieter**
helpful bits GmbH
Südliche Münchner Straße 55
82031 Grünwald
Germany

**Managing Director / Vertretungsberechtigt**
Kiryl Kazlovich (Geschäftsführer)

**Contact / Kontakt (schnelle elektronische Kontaktaufnahme)**
E-Mail: [legal@vibemanager.app](mailto:legal@vibemanager.app)
Telefon: +49 89 122237960

**Register entry / Handelsregister**
Amtsgericht München, HRB 287653

**VAT ID / Umsatzsteuer-ID**
DE348790234

**Responsible for content (§ 18 Abs. 2 MStV)** *(nur erforderlich bei journalistisch-redaktionellen Inhalten, z. B. Blog/News)*
Kiryl Kazlovich, Anschrift wie oben

**Consumer dispute resolution (VSBG) / Verbraucherstreitbeilegung**
We are neither willing nor obliged to participate in dispute resolution proceedings before a consumer arbitration board.
Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
*(Falls Sie freiwillig teilnehmen möchten, ersetzen Sie die obige Zeile durch: Wir nehmen an einem Streitbeilegungsverfahren vor folgender Verbraucherschlichtungsstelle teil: \[Name, Anschrift, Website].)*

**ODR platform / OS-Plattform (EU)**
Hinweis: Die **Europäische Online-Streitbeilegungsplattform (OS-Plattform)** wurde zum **20. Juli 2025** eingestellt. Ein Link ist daher nicht mehr erforderlich.

---

## K. Can Stripe file returns for me automatically?

**Yes, if you want.** Two choices:

* **Tax Basic (default):** Stripe **calculates/collects** tax; **you/your accountant file** using Stripe’s reports. No subscription.
* **Tax Complete:** Adds **registrations + filings** (via partners like **Taxually**) to calculations. Subscription with included quotas.

> Either way, you must **add your registrations in Stripe** (or let the partner flow add them) so calculation and filings know where to apply.

---

## L. What happens when the buyer enters tax info? (B2B vs B2C)

**EU & UK (VAT):**

* If a **business customer** enters a **valid VAT ID**, Stripe validates it. For **cross‑border B2B services**, Stripe applies **reverse charge** (0 VAT) and prints “Reverse charge.”
* **Germany → Germany:** a German VAT ID doesn’t usually remove VAT on domestic SaaS—VAT still applies.

**United States:**

* A tax ID/EIN alone is **not** an exemption. To avoid sales tax you need a **valid exemption certificate**; mark the customer **tax\_exempt** in Stripe.

**Canada:**

* B2B is **not automatically tax‑free**. Typically you still charge **GST/HST** (and QST/PST if relevant); buyers claim input credits.

**Where to put IDs:** Collect tax IDs in **Checkout** or on the **Customer**. Use `tax_exempt=reverse` (reverse‑charge) or `tax_exempt=exempt` (true exemption) when applicable.

---

## M. Simple, grown‑up explainers (with concrete examples)

**1) OSS (EU One‑Stop Shop)**

* **What it is:** A single **quarterly return in Germany** for your **B2C sales to EU countries outside Germany**. Germany forwards VAT to the other countries.
* **Use it if:** You sell to **EU consumers** outside Germany. You can opt in from day one; above **€10,000** cross‑border B2C threshold it’s effectively required unless you register everywhere.
* **In Stripe:** Add **European Union → Union OSS** once; keep your **Germany – Domestic** registration for German sales.
* **Example:** You sell a €50 credit pack to a **French consumer**. Stripe charges **FR VAT 20%**. You report it on your **German OSS** return, not in France.

**2) Nexus (US)**

* **What it is:** The connection to a US state that makes you collect its sales tax—either **physical presence** (office, employee, inventory) or **economic presence** (e.g., **\$100k or 200 transactions**; some states use **\$500k**).
* **What to do:** When you meet a state’s rule, **register with that state**. In Stripe, add **United States → \[State] → State sales tax** with your **start date**.
* **Example:** You cross **\$120k** of sales to **Texas** in 12 months. Register with **Texas** → add a **TX** registration in Stripe → Stripe starts charging TX tax to TX customers.

**3) B2B vs B2C in practice**

* **EU B2C** (DE → FR consumer): charge **FR VAT** via **OSS**.
* **EU B2B** (DE → FR business with VAT ID): apply **reverse charge** → **0 VAT**; invoice says “Reverse charge.”
* **UK B2C**: register for **UK VAT** and charge **UK VAT**.
* **US B2B**: charge state sales tax **unless** you have a **valid exemption certificate** on file.
* **Canada B2B**: usually charge **GST/HST** (and QST/PST if relevant); buyer takes input credit.

---

*This section complements earlier setup steps for helpful bits GmbH. Configure your **product tax code** as digital/SaaS and ensure **automatic tax** is enabled so these rules apply at checkout and on invoices.*

---

## N. Sanctions & KYC + “Can we start before registrations?”

### N.1 Sanctions & KYC (for helpful bits GmbH; owner has dual Belarus–German citizenship)

* **What Stripe checks:** Stripe complies with **US/EU/UK sanctions**. They block **sanctioned persons, banks, and jurisdictions**. Stripe **does not support users located in Belarus** and won’t process transactions that involve **sanctioned Belarusian financial institutions**.
* **Nationality vs. sanctions:** Sanctions are **not blanket nationality bans**. They target **specific people/entities and activities**. Having Belarusian citizenship **by itself** doesn’t bar you if you operate from **Germany**, use a **German bank**, and **none of your owners are on sanctions lists**. (OFAC/EU programs list named persons and sectoral restrictions.)
* **What to submit to Stripe/KYC:**

    1. **German passport/ID** for the director and all **UBOs** (25%+).
    2. **German address** and **German bank account** for payouts.
    3. Be ready for **enhanced due diligence** (extra questions) because of dual nationality—normal.
* **Operational guardrails:**

    * Avoid doing business with **sanctioned banks/parties**; don’t route payouts to Belarus.
    * If desired, block payments from unsupported/sanctioned locations at checkout.

### N.2 Can we start selling while registrations are pending?

*(The rules differ by region. “Collect” means charging tax at checkout.)*

| Region                                    | Can you sell now?  | Can you collect tax now?                                                                                                                                                                                             | Notes                                                                                      |
| ----------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Germany**                               | **Yes**            | **Yes** (you’re registered)                                                                                                                                                                                          | Keep filing your German VAT as usual.                                                      |
| **EU (other countries, B2C)**             | **Yes**            | **Only if** you (a) use **OSS** or (b) are **≤ €10,000** cross‑border B2C and choose to charge **DE VAT**. If OSS is pending and you’re over €10k, **don’t charge destination VAT** until your OSS number is active. | EU-wide micro‑threshold **€10,000**. OSS = one German quarterly return for B2C EU sales.   |
| **EU (B2B)**                              | **Yes**            | **Usually 0%** via **reverse charge** when customer provides a **valid VAT ID**.                                                                                                                                     | Stripe will mark invoice “Reverse charge.”                                                 |
| **United Kingdom (B2C digital services)** | **Better to wait** | **No** until registered (NETP has **no threshold**; VAT due from **first sale**).                                                                                                                                    | Register for **UK VAT** first; then add the UK registration in Stripe.                     |
| **United Kingdom (B2B)**                  | **Yes**            | **Usually 0%** via reverse charge with a **valid GB VAT ID**.                                                                                                                                                        | Keep evidence of the VAT ID.                                                               |
| **United States**                         | **Yes**            | **No** until registered in a state. Many states say collecting without a permit is **illegal**. Add each state in Stripe **after** approval.                                                                         | Typical economic nexus **\$100k / 200 tx**; some **\$500k**.                               |
| **Canada**                                | **Yes**            | **Only after** required registration. Federal **GST/HST** threshold **CAD \$30,000** (12 months).                                                                                                                    | When threshold is exceeded, you must register and start charging from that effective date. |

**Safe rollout plan while waiting:**

1. **Enable sales** to **Germany** (full VAT) and **EU/UK B2B** (reverse charge with validated VAT IDs).
2. Hold **UK B2C** until the **GB VAT** is issued.
3. For the **EU B2C**, either stay under **€10k** and charge **DE VAT**, or wait for **OSS** approval.
4. In the **US/Canada**, sell without tax **until registered**; monitor thresholds; **do not collect** before permits/registrations are active.
5. As each registration arrives, **add it in Stripe** and flip the switch for that region.

---

## ✅ Final pass (Aug 13, 2025) — What changed and what to do now

**What’s new in this revision** (clarifies earlier sections and closes gaps):

* Added **exact, copy‑pastable cURL** for: EU OSS/standard, UK, US states, and Canada (federal + provinces). Supersedes any earlier API snippets.
* Clarified **what Stripe’s “Register for me”** does (applications only; filings only on **Tax Complete**).
* Included **Checkout parameters** to capture addresses & tax IDs reliably for B2B/B2C.
* Documented **per‑state/per‑province breakdown** via Reports API and **Location reports**.
* Locked in **product tax code** for your use case (SaaS/API credits) and how to override.

> Company context: **helpful bits GmbH**, VAT ID **DE348790234**, Germany (GmbH). Product: **desktop app + API usage credits** (digital services/SaaS), global customers.

---

## 1) Region‑by‑region: exactly what to register

### A. European Union (you’re DE‑established)

**Default path (recommended for B2C): VAT OSS (Union scheme)**

* Register once in **Germany’s OSS portal**.
* After OSS is active, **collect local VAT** for EU consumers at their country rates and **file ONE OSS return** in Germany.
* In Stripe: add **one EU OSS registration** (see API below) and keep your **German VAT ID** on the account.

**Alternative (if you do not use OSS): country‑by‑country VAT registrations.**

* Adds heavy admin: you must **file in each country** separately. Only choose this if a local rule forces it.

**B2B inside the EU**

* When the buyer enters a valid EU VAT ID, Stripe Tax applies **reverse charge** (0% on invoice) and prints the note. You still need your own DE VAT ID on the invoice header.

### B. United Kingdom

* If you have **UK VAT registration** (for NETP or local sales), add a **UK registration** in Stripe. Stripe will then calculate **UK VAT** on eligible sales and you **file UK VAT returns** with HMRC (Stripe can file only on **Tax Complete**).

### C. United States

* US sales tax is **state‑by‑state** (nexus based). When you **register in a state**, add a **separate state registration** in Stripe. Stripe then calculates the correct state/local tax and includes it in reports.
* If you’re **not registered** in a state, Stripe shows **0 tax** for that state. If you **do have nexus** there, you must register before collecting.

### D. Canada

* Two layers: **federal GST/HST** and **provincial PST/QST/RST**.
* Add **federal (simplified)** registration if you’re a non‑resident or **standard GST/HST** if applicable.
* Add **province‑level registrations** (BC PST, SK PST, MB RST, QC QST) if required. Each province is separate in Stripe.

---

## 2) Stripe configuration — one‑time setup (API‑first)

### 2.1 Tax Settings (head office, defaults)

Use **SaaS business use** tax code by default. You can override per product/price later.

```bash
# Set head office (DE), default behavior, and default SaaS tax code
curl https://api.stripe.com/v1/tax/settings \
  -u sk_live_xxx: \
  -d defaults[tax_behavior]=exclusive \  # or 'inclusive' if you price VAT‑in
  -d defaults[tax_code]=txcd_10103001 \  # SaaS – business use
  -d head_office[address][country]=DE
```

Notes:

* **exclusive**: add tax on top of the price (recommended globally).
* **inclusive**: tax included in the price (common for EU consumer pricing).
* `txcd_10103001` fits **SaaS/API credits**. If you sell a purely **downloaded** app price, consider an alternate code on that **price** only.

### 2.2 Put your own IDs on invoices (account tax IDs)

```bash
# Add German VAT ID to the account header (appears on invoices)
curl https://api.stripe.com/v1/tax_ids \
  -u sk_live_xxx: \
  -d type=eu_vat \
  -d value=DE348790234

# (If/when registered for UK VAT)
curl https://api.stripe.com/v1/tax_ids \
  -u sk_live_xxx: \
  -d type=gb_vat \
  -d value=GB123456789

# (If/when you get an OSS number, Stripe also supports eu_oss_vat as an account tax ID)
# curl https://api.stripe.com/v1/tax_ids -u sk_live_xxx: -d type=eu_oss_vat -d value=EUxx...  
```

### 2.3 Add registrations (turns on calculation per region)

#### EU (choose ONE of the two strategies)

**(i) Register once for VAT OSS (Union) — recommended**

```bash
# Create an EU OSS (Union) registration anchored in DE
curl https://api.stripe.com/v1/tax/registrations \
  -u sk_live_xxx: \
  -H "Stripe-Version: 2025-04-30.basil" \
  -d country=DE \
  -d country_options[de][type]=oss_union \
  -d active_from=2025-08-01   # or 'now' or the date issued by the portal
```

**(ii) Country‑by‑country (NOT recommended if OSS is available)**

```bash
# Example: add a standard VAT registration in FR
curl https://api.stripe.com/v1/tax/registrations \
  -u sk_live_xxx: \
  -d country=FR \
  -d country_options[fr][type]=standard \
  -d active_from=now
```

#### United Kingdom

```bash
curl https://api.stripe.com/v1/tax/registrations \
  -u sk_live_xxx: \
  -d country=GB \
  -d country_options[gb][type]=standard \
  -d active_from=now
```

#### United States (one per state where you registered)

```bash
# California example (state sales tax)
curl https://api.stripe.com/v1/tax/registrations \
  -u sk_live_xxx: \
  -H "Stripe-Version: 2025-04-30.basil" \
  -d country=US \
  -d country_options[us][state]=CA \
  -d country_options[us][type]=state_sales_tax \
  -d active_from=now

# Bash helper to add many states at once (replace the list with your registered states)
for S in CA NY WA TX FL; do \
  curl https://api.stripe.com/v1/tax/registrations -u sk_live_xxx: \
    -H "Stripe-Version: 2025-04-30.basil" \
    -d country=US \
    -d country_options[us][state]="$S" \
    -d country_options[us][type]=state_sales_tax \
    -d active_from=now; \
  echo; \
done
```

#### Canada

```bash
# Federal GST/HST (simplified) for non‑resident
curl https://api.stripe.com/v1/tax/registrations \
  -u sk_live_xxx: \
  -d country=CA \
  -d country_options[ca][type]=simplified \
  -d active_from=now

# Province‑level PST/QST/RST (one per province where you register)
# Example: British Columbia PST
curl https://api.stripe.com/v1/tax/registrations \
  -u sk_live_xxx: \
  -d country=CA \
  -d country_options[ca][type]=province_standard \
  -d country_options[ca][province]=BC \
  -d active_from=now
```

> Ending a registration later: `POST /v1/tax/registrations/{id} -d expires_at=now`.

### 2.4 Make Checkout/Invoicing actually collect tax

**Checkout Sessions**

```bash
# One‑time or subscriptions — collect addresses + tax IDs + auto tax
curl https://api.stripe.com/v1/checkout/sessions \
  -u sk_live_xxx: \
  -d mode=payment \                            # or subscription
  -d success_url="https://example.com/success" \
  -d cancel_url="https://example.com/cancel" \
  -d automatic_tax[enabled]=true \             # triggers address collection if needed
  -d billing_address_collection=auto \         # ensures you have an address
  -d tax_id_collection[enabled]=true \         # collect VAT/GB VAT/etc for B2B
  -d customer_update[address]=auto \           # persist address back to Customer
  -d "line_items[0][price]"=price_xxx \
  -d "line_items[0][quantity]"=1
```

**Invoices / Subscriptions (API‑driven)**

```bash
# Invoices
curl https://api.stripe.com/v1/invoices \
  -u sk_live_xxx: \
  -d customer=cus_xxx \
  -d automatic_tax[enabled]=true

# Subscriptions (tax applies to all future invoices)
curl https://api.stripe.com/v1/subscriptions \
  -u sk_live_xxx: \
  -d customer=cus_xxx \
  -d items[0][price]=price_xxx \
  -d automatic_tax[enabled]=true
```

**Products/Prices**

```bash
# Set a product‑level tax code (overrides default if present)
curl https://api.stripe.com/v1/products/prod_xxx \
  -u sk_live_xxx: \
  -X POST \
  -d tax_code=txcd_10103001

# If you need a separate 'downloaded app' price, set tax behavior per price
curl https://api.stripe.com/v1/prices/price_xxx \
  -u sk_live_xxx: \
  -X POST \
  -d tax_behavior=exclusive   # or inclusive
```

---

## 3) Reporting you’ll need (for filings and your accountant)

### 3.1 Itemized & summarized exports (API)

Run a **Reports API** job and fetch the file programmatically:

```bash
# US/EU/GB/CA itemized transactions with tax details
curl https://api.stripe.com/v1/reporting/report_runs \
  -u sk_live_xxx: \
  -d report_type=tax.transactions.itemized \
  -d parameters[interval_start]=2025-07-01 \
  -d parameters[interval_end]=2025-07-31

# Later: GET /v1/reporting/report_runs/{id} -> file -> download
```

> You can also download **summarized** reports in Dashboard. Stripe also offers **Location reports** (US/CA) in the Dashboard for state/province summaries.

### 3.2 Data → Query / Exports

* Use **Data → Query (Stripe SQL)** or schedule **Data → Exports → Tax reports** to push CSVs to your storage.
* For deeper pipelines, **Data Pipeline** can stream to BigQuery/Snowflake.

---

## 4) What Stripe does vs. what you still do

* **Stripe Basic**: Calculates/collects tax where you’ve added registrations. Generates reports and reverse‑charge logic. **Does not** file/remit.
* **Register for me**: Stripe (or Taxually) **prepares & submits registration applications** with tax authorities based on your inputs. You still add the registration to Stripe once approved.
* **Tax Complete**: Adds **filing & remittance** in supported locations (Stripe handles returns & payments on schedule).

---

## 5) Practical guard‑rails (don’t skip)

* **Only collect where registered.** For US/CA provinces, create the registration **before** turning on collection.
* **Address confidence matters.** Checkout parameters above ensure Stripe has enough location info. For digital products with no shipping, Stripe falls back to **billing address → card issuer country → IP**.
* **Capture tax IDs for B2B.** With `tax_id_collection[enabled]=true`, Stripe applies reverse charge/zero‑rate when allowed.
* **Keep product tax code accurate.** Default to `txcd_10103001` (SaaS – business use). Override per product/price if you add a different offering.
* **EU strategy:** Prefer **OSS** for B2C across the EU. If you configure each EU country separately in Stripe, you’re opting **out** of OSS and must **file in each**.

---

## 6) Quick go‑live checklist (your case)

1. **Finish DE VAT & (if B2C EU) DE OSS** registrations.
2. Call **Tax Settings** API (2.1) and **Account Tax ID** (2.2).
3. Add **EU OSS registration** (or per‑country standard) + **GB standard** + **US states where registered** + **CA: federal + any PST/QST**.
4. Switch your checkout/subscriptions to **`automatic_tax[enabled]=true` + address & tax‑ID collection**.
5. Ship; use **Reports API** (3.1) monthly and share with your accountant (or enable **Tax Complete** to file for you where supported).

---

## P. Restrict sales to certain locations (Stripe‑native ways)

> Goal: Only allow buyers from specific countries/states to complete checkout.

### P.1 Fastest (no code): Radar rules

Use **Stripe Radar → Rules** to block or review payments by location. Common predicates:

* `:ip_country`, `:card_country`, `:billing_country`, `:shipping_country`, `:billing_state` (US states), `:shipping_state`.
* Actions: **block**, **review**, **allow**, **require\_3ds**.

**Examples (add in Dashboard ▸ Radar ▸ Rules):**

* **Allow only EU+UK+US+CA (block everything else):**
  `if :ip_country not in @allow_countries or :billing_country not in @allow_countries then block`
* **Block sanctioned/unsupported regions:**
  `if :ip_country in ('BY','RU','IR','KP','SY','CU','SD') then block`
* **Restrict to a few US states (billing address required):**
  `if :billing_country = 'US' and :billing_state not in @us_allowed_states then block`

**Automate the allow‑lists via API (Value Lists):**

```bash
# Create a value list for countries you allow
curl https://api.stripe.com/v1/radar/value_lists -u sk_live_xxx: \
  -d name="Allowed Countries" -d alias=allow_countries -d item_type=country

# Add items (repeat per ISO code)
for C in DE FR ES IT NL SE DK NO FI IE GB US CA; do \
  curl https://api.stripe.com/v1/radar/value_list_items -u sk_live_xxx: \
    -d value=$C -d value_list=@allow_countries; \
  echo; \
done

# US states allow‑list (for example only CA, NY, TX)
curl https://api.stripe.com/v1/radar/value_lists -u sk_live_xxx: \
  -d name="Allowed US States" -d alias=us_allowed_states -d item_type=string
for S in CA NY TX; do \
  curl https://api.stripe.com/v1/radar/value_list_items -u sk_live_xxx: \
    -d value=$S -d value_list=@us_allowed_states; \
  echo; \
done
```

> Set the **rules once** to reference `@allow_countries` / `@us_allowed_states`. Later you can update those lists by API without touching the rules.

**Tips**

* Pair with `billing_address_collection=required` in Checkout so **billing country/state** is always present.
* Add a **fallback**: if a value is missing, default to blocking or requiring manual review.

### P.2 Checkout‑level gating (shipping address)

If you use Checkout with **shipping address collection**, you can hard‑restrict by **shipping country** at the session:

```bash
curl https://api.stripe.com/v1/checkout/sessions -u sk_live_xxx: \
  -d mode=payment \
  -d automatic_tax[enabled]=true \
  -d shipping_address_collection[allowed_countries][]=DE \
  -d shipping_address_collection[allowed_countries][]=AT \
  -d shipping_address_collection[allowed_countries][]=CH \
  -d billing_address_collection=required \
  -d tax_id_collection[enabled]=true \
  -d "line_items[0][price]"=price_xxx -d "line_items[0][quantity]"=1 \
  -d success_url=https://example.com/success -d cancel_url=https://example.com/cancel
```

Notes:

* This blocks buyers whose **shipping country** isn’t allowed. It’s the most rigid gate, but it requires enabling shipping address collection (even for digital products). If you don’t want shipping in the UX, prefer **Radar**.

### P.3 App‑side gating (optional)

* Do a **pre‑check** using IP geolocation and hide the purchase UI outside allowed regions.
* Still keep **Radar** rules in Stripe as a backstop (in case users VPN or bypass the app check).

**Minimal recipe for your case (software/API credits):**

1. Set `billing_address_collection=required` and `tax_id_collection[enabled]=true` in Checkout.
2. Add **Radar rules** to block by `:ip_country` and `:billing_country` using `@allow_countries`.
3. (If limiting US states) Add `@us_allowed_states` and a rule on `:billing_state`.
4. Optionally add `shipping_address_collection[allowed_countries]` if you want a hard gate at Checkout.

---

### Appendix — Reference values you’ll likely use

* **Tax code** for your product: `txcd_10103001` (SaaS – business use).
* **US registration type**: `state_sales_tax` (per state).
* **EU registration type**: `oss_union` (recommended) or `standard` (per country).
* **GB registration type**: `standard`.
* **CA registration types**: `simplified` (GST/HST for non‑resident) and `province_standard` (PST/QST/RST per province).

> This appendix **supersedes** any prior automation/API section in this document.
