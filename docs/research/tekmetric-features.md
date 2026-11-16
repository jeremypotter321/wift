# Tekmetric feature inventory (baseline for Shopboard)
Researched 2026-11-16.

Confidence: [V] = verified on a fetched Tekmetric page. [R] = third-party review or snippet. [D] = standard shop-software domain knowledge, not confirmed on a Tekmetric page.
Caveat: help-center pages (support.tekmetric.com) returned HTTP 403 to automated fetch, so field-level detail for most modules is [D].

## Sources
- Features: https://www.tekmetric.com/features
- Pricing: https://www.tekmetric.com/pricing
- Job board and RO lifecycle: https://www.tekmetric.com/post/repairs-management-software-job-board
- Nov 2024 rundown: https://www.tekmetric.com/post/tekmetrics-november-2024-product-rundown
- Payments: https://www.tekmetric.com/feature/payments-processing
- Release notes (403 to fetch; seen in search snippets): https://support.tekmetric.com/hc/en-us/articles/360041785434-Release-Date-Feature-Notes
- Integrations (snippets): https://support.tekmetric.com/hc/en-us/articles/360041671633, https://tours.tekmetric.com/answers/integrations-tekmetric
- Reviews: https://www.capterra.com/p/190952/Tekmetric/, https://www.g2.com/products/tekmetric, https://www.softwareadvice.com/auto-repair/tekmetric-profile
  - G2 averages 4.9 from 490 reviews; Software Advice 4.7 from 105.
  - Reviewers praise ease of use and update frequency.
  - Some say integrations and tech management are not very flexible.

## Pricing tiers [V]
Pricing is per shop with unlimited users.

| Tier | Monthly | Billed annually | What it adds |
|---|---|---|---|
| Start | $199 | $179 | Inventory and vendors, DVI, Smart Jobs, digital authorizations and invoicing |
| Grow | $349 | $309 | Labor guide, maintenance schedule, time and job clocks, parts/inventory/marketing reports |
| Scale | $439 | $409 | Two-way texting, real-time dashboard, technician board, employee performance analytics |
| Enterprise | custom | custom | Integrated Payments, account manager, quarterly reviews |

Add-ons: Multi-shop +$70/mo, Tire Suite +$39/mo, Marketing +$345/mo. Payments is quoted on request.

## Feature tree
Feasibility key: local = buildable offline; svc = needs-service; n/a = n/a-single-shop.

### 1. Repair orders (RO) [V]
- **RO lifecycle.** The Job Board has three Active columns plus saved views.
  - Estimates: statuses Not Started, Requires Authorization, Pending Authorization, Declined All.
  - Work-in-Progress: the RO moves here automatically when at least one job is approved. Manual statuses are In Progress, Waiting on Parts, Waiting on Sublet.
  - Completed: set by "Complete Work", then payment is collected.
  - Paid or Accounts Receivable (A/R): "Post as Paid", "Post to A/R", "Unpost", "Reopen RO".
  - Other views: Saved for Later, Deleted.
  - Cards show icons for estimate sent and estimate viewed. Cards group by status, employee, or appointment type (waiting vs drop-off).
  - Tier: Start. Feasibility: **local**. The "viewed" icon needs a hosted link, so it is svc; drop that.
- **Jobs and line items.** Each job holds labor lines, part lines, fee lines, sublet lines, discounts, and tax. Declined jobs stay visible in the RO. Reassigning a job's tech reassigns all its labor lines (Feb 2026 note, [R]).
  - Entities: RO, Job, LaborLine (hours, rate, tech), PartLine (qty, cost, price, vendor, part#), Fee, Sublet, Discount, TaxRate.
  - Feasibility: **local**.
- **Smart/Canned jobs.** Prebuilt service packages, for example an oil change, with control over how pricing is presented. Canned jobs can be added to an existing job.
  - Entities: CannedJob, template lines, default inspection mapping.
  - Tier: Start. Feasibility: **local**.
- **Labor and parts pricing matrices.** Rules that apply markup by cost range and labor rate by category, so pricing is consistent. [V]
  - Entities: PartsMatrix (cost range to markup %), LaborRate (by category).
  - Feasibility: **local**.
- **Shop supplies, fees, taxes.** Configurable fees (supplies, hazmat) with caps, and tax rates per labor, parts, and fees. [D]
  - Feasibility: **local**.
- **Print and share invoice.** "View & Share Invoice". Feasibility: **local** as PDF/print. Online link delivery is svc.

### 2. Labor guide (Grow tier) [V that it exists; the data vendor is [D]]
- Looks up book labor hours by vehicle and operation.
- Tekmetric's pages name ALLDATA as a repair data source. MOTOR was not found.
- Feasibility: **svc** (licensed data, for example MOTOR, ALLDATA, Mitchell). Local fallback: your own canned jobs with historical hours per job.

### 3. Parts ordering and inventory [V]
- **Inventory.** Stock on hand, parts in use, parts awaiting return, tied to ROs. A shop-level inventory feed shows edits to spot shrinkage. Start tier. Feasibility: **local**.
- **Vendors and purchase orders (PO).** Vendor records and parts orders against ROs. [D] Tekmetric's PO# is a fleet customer field, not a vendor PO. Feasibility: **local**.
- **Parts catalog ordering.** PartsTech (free to set up) lets you fill a cart and import it back into the RO. Nexpart and WORLDPAC are also listed in third-party lists [R]. Feasibility: **svc**. Local fallback: type part# and price manually.

### 4. Digital vehicle inspection, DVI (Start tier) [V]
- Inspections are tightly coupled to the RO. They include photos and video that the customer can view and approve.
- Default inspections are assigned per appointment or canned job. [R]
- Entities: InspectionTemplate, Section, Item, Rating, Media, Note. The green/yellow/red rating and the findings-to-estimate-line conversion are [D].
- Feasibility: **local**, with photos stored on disk. Customer-facing viewing needs a hosted link, so it is svc. Fallback: PDF report.

### 5. Customer approval / authorization (Start tier) [V]
- Estimate is sent, the customer approves or declines per job, and the RO moves to WIP.
- Entities: Authorization (job, decision, timestamp, signature, method).
- Feasibility: **needs-service** for text or email delivery (Twilio, an email provider). Fallback: print or PDF the estimate, and have the customer sign on screen or on paper at the counter.

### 6. Customers and vehicles [D]
- Customer: name, phones, email, contact preference, notes, tax-exempt flag, fleet flag.
- Vehicle: VIN, year, make, model, engine, plate, mileage, notes.
- Service history is derived from ROs.
- VIN decode: **local plus free service**, using NHTSA vPIC (free, no key; cache results).
- Vehicle history report: CARFAX integration [V]. Feasibility: **svc** (paid). Skip it.

### 7. Appointments, scheduling, calendar [V that it exists; details [D]]
- Online Booking (beta) embeds a booking widget on the shop website. Appointment types include waiting and drop-off.
- Entities: Appointment (customer, vehicle, start, end, type, tech, requested services).
- Calendar: **local**. Public online booking: **svc**, because it needs a hosted endpoint.

### 8. Tech board and job board [V]
- Tech Board (Scale tier): a left column of unassigned ROs plus one column per tech showing their work-in-progress. ROs arrive after customer approval. Permissions control who can mark complete.
- Feasibility: **local**.

### 9. Time clock and labor tracking (Grow tier) [V]
- Techs clock in, out, and take breaks from the mobile app. Job clocks track per-job time.
- Entities: TimeEntry (employee, in, out, break), JobClock (labor line, start, stop).
- Derived: tech efficiency, hours billed vs hours clocked. [D]
- Feasibility: **local**.

### 10. Payments [V]
- Tender types: cash, check, card (in shop, by phone, remote), Apple Pay and Google Pay, text-to-pay, Buy Now Pay Later (Affirm, Klarna, Sunbit), A/R charge accounts and installments, and Capital Financing for the shop.
- The processing tooling named on the page is Stripe Radar. Payments is an Enterprise-tier or quoted add-on, with next-day funding.
- Feasibility: record cash, check, and external-terminal card **local**. Integrated card, text-to-pay, and BNPL are **svc** (Stripe, a terminal). Capital Financing is not applicable.

### 11. Customer communication [V]
- Two-way texting (Scale tier) with texts tied to ROs. Feasibility: **svc** (Twilio, or similar).
- Email: **svc** (SMTP). Local fallback: click-to-call, copy-to-clipboard message templates.

### 12. Marketing, reminders, CRM [V]
- Automated reminders, scheduled campaigns, and a maintenance schedule (Grow tier). A Marketing add-on is $345/mo, plus Google Reviews requests and Websites.
- Local: next-service-due list per vehicle from mileage and date (**local**). Sending is **svc**. Fallback: print or export a "due for service" list, or mail merge.

### 13. Reporting [V that it exists; metrics [V] ARO, car count, close ratio, declined jobs, end-of-day report]
- Also: sales, GP%, tech productivity, parts reports, inventory reports, employee performance (Scale tier).
- Tekmetric Shop Index benchmarks you against other shops. Feasibility: **local** for all except benchmarking, which is **n/a**.

### 14. Accounting [V that it exists]
- Accounting Link syncs to QuickBooks (Online and Advanced). Feasibility: **svc** (QuickBooks Online API). Fallback: CSV or IIF export of invoices and payments.

### 15. Tire Suite (+$39/mo) [V that it exists; details [D]]
- Tire inventory, tire sizing, tire quotes, tire-specific service work.
- Feasibility: **local** for a tire size and stock table. Catalog lookups are **svc**.

### 16. Fleet [V]
- Fleet customers have a PO# shown on estimates, invoices, and A/R statements.
- Entities: Customer.fleet flag, PO#, A/R terms and statements.
- Feasibility: **local**. Low priority for a single-owner German-car shop.

### 17. Settings, users, roles, permissions [V]
- Role-based permissions control actions like Delete and Mark Complete. The Start tier includes unlimited users.
- Settings cover labor rates, matrices, fees, taxes, and statuses.
- Feasibility: **local**.

### 18. Multi-shop (+$70/mo) [V]
- Shared customer profiles, standardized inspections and pricing, centralized employees, and combined reporting.
- **n/a-single-shop**.

### 19. Mobile and tech app [V]
- Staff use inspections, camera, and time clock from phones.
- Feasibility: in Electron, run it on the shop computer. Use a tablet via the local network only if you add a LAN server. Otherwise skip.

### 20. Reviews [V]
- Google Reviews collection and management.
- **svc**. Fallback: a printed card with a QR code to the shop's Google review page.

## Features that need a paid or external account, with local fallback
| Feature | Service | Local or free fallback |
|---|---|---|
| Text/email approval and two-way texting | Twilio or SMS gateway, SMTP | Print or PDF the estimate, customer signs on screen or paper; copy-paste message templates |
| Card payments, text-to-pay, BNPL | Stripe or terminal | Record the tender manually, using a standalone card reader |
| Labor guide | MOTOR, ALLDATA, Mitchell | Own canned jobs and historical hours |
| Parts catalog ordering | PartsTech, Nexpart, WORLDPAC | Manual part#, cost, and vendor entry |
| Accounting | QuickBooks Online API | CSV or IIF export |
| Vehicle history | CARFAX | Local service history from past ROs |
| VIN decode | NHTSA vPIC (free) | Cached lookups, manual entry offline |
| Online booking | Hosted web endpoint | Local calendar |
| Reminders and campaigns | SMS or email provider | Printable "due" list |
| Reviews | Google | Printed QR card |
