# Heya Little Flores — storefront prototype

A mobile-first, English-language storefront concept for international Polynesian personal shopping.

## Current status
- Responsive storefront, service cards, request form and interactive bag: prototype.
- Form opens a prefilled email draft; it does not securely store requests.
- Checkout is intentionally inactive until a payment provider is confirmed.
- Airtable and Cloudflare Worker are not yet connected.
- Prices and shipping are not hardcoded; confirm with each customer before checkout.

## Suggested production architecture
- GitHub: source of truth and version control.
- Cloudflare Pages or the existing Cloudflare Worker platform: storefront.
- Cloudflare Worker endpoint: validate and store requests; keep API tokens server-side.
- Airtable: enquiries, curated selections, customer approvals, orders and fulfilment status.
- Payment provider: abstract behind a server-side checkout adapter. Confirm eligibility for a business established in French Polynesia before enabling live checkout. Stripe currently excludes businesses established in French Polynesia (official Stripe support page: https://support.stripe.com/questions/stripe-availability-for-outlying-territories-of-supported-countries?locale=fr-FR).
- Currency: confirm settlement and accounting needs before promising USD checkout.

## Airtable tables
1. Enquiries: Name, Email, Country, Occasion, Sizes, Budget, Style Brief, Notes, Status, Created At.
2. Selections: Enquiry, Item Name, Description, Supplier URL, Cost, Sale Price, Availability, Customer Approved.
3. Orders: Order Ref, Customer Email, Enquiry, Items JSON, Subtotal, Shipping, Tax, Currency, Payment Status, Provider Reference, Fulfilment Status.
4. Payments: Order Ref, Provider, Checkout Reference, Amount, Currency, Status, Paid At. Never store card data.

## Before launch
- Create a dedicated repository (this starter currently lives in a feature branch of the existing boutique platform repository).
- Connect a dedicated Cloudflare Pages/Worker project and configure encrypted secrets.
- Add server-side validation, spam/rate limiting, consent/privacy copy, request persistence, transactional email and error logging.
- Confirm legal terms, international shipping, customs/tax handling, returns, privacy, and a payment provider eligible for the business location.
- Test checkout end-to-end in provider sandbox mode before accepting money.
