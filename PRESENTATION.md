# Mahakumbh Stage — Phase 1 stakeholder demonstration pack

Status: presentation build, prepared 20 November 2026 for the 1 January 2027 review.

## Demonstration boundary

The frontend contains a clearly labelled illustrative catalogue and simulated checkout. It must be presented as a product walkthrough, not as live inventory or a government-approved booking service. Illustrative properties, prices, ratings, availability, confirmations and dashboards are marked as demo/sample in the UI. Live MySQL properties are never exposed until an operator submits them, verifies documents, approves the listing, and loads inventory.

The local backend is ready for a controlled sandbox once live records, Razorpay test keys, SMTP and an admin account are provisioned. No demo transaction is a real customer booking and no payment is collected.

## Functional journey test report

| Journey | Result | Evidence / qualification |
|---|---|---|
| Homepage and responsive navigation | PASS | Existing homepage, language selector, skip link, keyboard focus and responsive layout verified in the local browser build. |
| Nashik accommodation search | PASS (demo) | Illustrative catalogue supports destination, dates, guests, rooms, URL state and result rendering. |
| Filters, sorting and empty/loading states | PASS | Search filters, chips, clear controls, pagination and mobile filter presentation are implemented. |
| Hotel details and room selection | PASS (demo); LIVE pending data | Illustrative details use sample rates. Live details use `/api/stays/:id` and require an approved MySQL property. |
| Real availability and server-side pricing | READY / not executable locally | Booking engine locks `mks_room_nights` rows and calculates tax server-side. No approved property with inventory is currently provisioned. |
| Payment sandbox and confirmation | BLOCKED until credentials | Razorpay test keys and webhook secret are not configured. Frontend demo payment explicitly does not create a reservation. |
| Customer dashboard | PASS (demo); LIVE requires auth | Demo account is labelled. Production dashboard is backed by session-scoped reservation APIs. |
| Hotel partner booking view | READY / requires approved partner | Backend ownership checks and scoped partner routes are present. |
| Admin transaction and commission view | READY / requires admin seed | Create the first admin with `npm.cmd run admin:create`; commission is snapshotted on confirmation. |
| Rental host submission → approval → search | READY / requires records | Documents, temporary-stay safety requirements, review state and publication gates are enforced server-side. |
| Bulk group enquiry | PASS | Public enquiry, staff assignment and partner-scoped quote workflow are implemented. |
| Concurrency and double-booking protection | PASS by code path; load test pending | Transactional row locks, holds, expiry and idempotency are implemented; production load test remains required. |

## Demo walkthrough script

1. Open the homepage and point out the “illustrative/demo” disclosure.
2. Choose English, Marathi, then Hindi to demonstrate persistent language selection.
3. Search Nashik for sample dates and two guests; show URL-preserved selections.
4. Apply a property type, price and amenity filter; clear one chip and then clear all.
5. Open a sample property and explain that its availability and price are illustrative.
6. Walk through the labelled demo checkout and simulated payment. Explicitly state that no charge, hold, email or booking occurs.
7. Open Customer demo, Hotel partner demo and Administrator demo views, calling out that these are presentation-only screens.
8. Open List Your Property, show temporary accommodation safeguards and the admin review gate.
9. Submit a bulk accommodation enquiry with a group of 25 and explain the quotation workflow.
10. For the technical review, show `/healthz`, `/readyz`, MySQL migration status and the live-booking architecture separately.

## Security and performance findings

- PASS: HTTP-only operation sessions, CSRF validation, scrypt passwords, backend RBAC, ownership checks, request IDs, security headers, input limits and rate limiting.
- PASS: server-side booking quote, transaction isolation, inventory row locks, expiring holds, webhook verification and idempotency keys.
- PASS: private documents are served through authenticated routes; public media is separated.
- PASS: responsive WebP derivatives, lazy loading, canonical URLs, sitemap, robots, hreflang and structured data are present.
- PENDING: measure Core Web Vitals on the final HTTPS deployment with real devices and production CDN. Local field measurements are not release evidence.
- PENDING: run concurrency/load tests against staging MySQL and verify queue retry/alert behaviour.

## Remaining issues before public launch

1. Provision approved properties, room types, nightly inventory and genuine review records.
2. Configure Razorpay test keys/webhook first, then production credentials after reconciliation testing.
3. Configure SMTP, object storage/CDN and shared Redis/queue infrastructure for multiple instances.
4. Create admin and partner accounts with least-privilege permissions.
5. Complete load, backup-restore, webhook replay, cancellation/refund and accessibility testing on staging.
6. Replace illustrative homepage catalogue only when verified records are available.

## Deployment checklist

- [ ] HTTPS reverse proxy, `APP_ORIGIN`, `SITE_ORIGIN`, secure cookies and `HOST=0.0.0.0`
- [ ] Database-scoped MySQL user, TLS, backups and restore drill
- [ ] `npm.cmd run db:migrate`, then `npm.cmd run db:status`
- [ ] Create admin, review staff permissions and rotate bootstrap credentials
- [ ] Razorpay sandbox webhook signature test and replay/idempotency test
- [ ] SMTP sender/domain verification and notification retry monitoring
- [ ] CDN/object storage, image upload limits and malware/content checks
- [ ] Redis/shared rate-limit and background worker configuration
- [ ] Staging load test, CWV measurement, security scan and broken-link crawl
- [ ] Government source review for every CMS date, advisory and emergency contact

## Infrastructure requirements

Node.js 20+, MySQL 8/InnoDB, HTTPS reverse proxy, object storage/CDN, Redis for shared cache/rate limits, a durable worker queue, SMTP provider, Razorpay account, centralized logs/metrics/alerts, encrypted backups and a staging environment isolated from production.
