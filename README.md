# MahakumbhStays

Responsive frontend prototype for an accommodation marketplace focused on Nashik and Trimbakeshwar.

## Run locally

Install Node.js, then run from this directory:

```sh
npm ci
npm run dev
```

Open http://localhost:3000.

## Included

- Homepage, destination collections, FAQs and travel guide
- Ten demo properties with search, filters, sorting and saved stays
- Property details, room selection and photo categories
- Guest checkout, simulated payments, confirmation and demo voucher
- Customer, property partner and admin demo views
- Property listing introduction and browser-local listing drafts
- Responsive layouts and mobile booking bar

## Project structure

- `dist/` — frontend HTML, CSS, JavaScript and local image assets
- `server.cjs` and `stay-api.cjs` serve the frontend and search API

The frontend uses plain JavaScript and CSS. Saved stays and listing drafts use browser storage. The demo checkout is simulated.

## Search data

`GET /api/stays` filters, ranks and paginates SQLite records. Running without configuration loads the existing illustrative catalog into memory. These listings carry no live stock, verified status, review scores or map coordinates.

Set `MAHAKUMBH_STAYS_DB` to the path of an operator-managed SQLite database built with `stays-schema.sql` to search real records. The server reads a single-file SQLite snapshot and reloads it when the file changes. Publish a consistent snapshot after checkpointing any write-ahead log. Keep the database outside `dist/`.

- Inventory comes from `room_nights` for each room type. Each night from check-in through the night before check-out must have enough rooms of the same type for the party. Rates are stored in paise. Results show the lowest eligible room type's average nightly rate before taxes.
- Travel distances, property coordinates, verification, amenities and cancellation policies must come from operator-managed data. Rating uses only published reviews linked to verified stays.
- The SQLite adapter is a read-only search source. MySQL powers live checkout. Illustrative listings retain the demo checkout.

Serve the frontend and API on the same origin with `npm run dev` or an equivalent Node deployment. A static-only upload of `dist/` supplies the UI without the search endpoint.

## MySQL reservations

1. Configure a MySQL 8 database in `.env` using `.env.example`. Use a database-scoped account for production and provision real listings before opening checkout.
2. Run `npm run db:migrate`, then `npm run dev`. The migrations add `mks_*` tables. Search uses MySQL when at least one live property is present. An empty calendar is unavailable. When MySQL has no live properties, the illustrative catalog remains available for browsing.
3. Populate property metadata, room categories and nightly inventory using `booking-schema.sql`. For each room category and date, enter the unsold, unheld room count, rate in paise and applicable tax in basis points. Keep any inventory updates coordinated with the booking ledger. Enter cancellation terms as a refund percentage in basis points and a deadline in hours before the check-in date starts in India. Supply real listing and room image URLs, property address, recorded distances and meal information. Publish reviews only after verifying the guest stay.
4. Configure Razorpay API keys and a dedicated webhook secret. Enable automatic capture and configure `POST /api/razorpay-webhook` on the HTTPS site for `payment.captured`, `refund.processed` and `refund.failed`. Start with test keys. The browser callback opens a status check, and only a verified captured-payment webhook can confirm a reservation. [Razorpay webhook validation](https://razorpay.com/docs/webhooks/validate-test/)
5. Set `SMTP_URL` and `SMTP_FROM` for confirmation and cancellation email. Keep the Node service running for hold expiry and outbox delivery. Refunded late payments appear on the reservation when linked to a received capture. Review failed refunds and queued jobs in MySQL during operations.
6. Run `npm run hotel:token -- <listing-id>` to provision a scoped hotel token. Share it securely with the property operator and revoke it by removing its hash from `mks_hotel_access`. This token is available through the legacy hotel booking API. Hotel owners use the signed-in Hotel Partner Portal. Guest reservations are scoped to the browser session that placed them and appear under My Trips.

Reservations hold inventory for 15 minutes using row locks. Expiry and cancellation restore inventory transactionally. Payment order retries use the same reservation receipt. Refund retries use a stable provider idempotency key. The customer sees the calculated tax and cancellation terms before placing a hold. The application uses HTTP-only cookies. Set `NODE_ENV=production` and `APP_ORIGIN` to the HTTPS application origin in production. Set `HOST=0.0.0.0` when the Node runtime must accept traffic from a reverse proxy or container network.

## Admin and rental host workspaces

- Run `npm run db:migrate` to install the operations tables alongside the existing booking tables. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the ignored local `.env`, run `npm run admin:create` once, then remove those two values from the file. Use a unique password of 12 to 128 characters. Sign in at `/#/admin`. Staff accounts and their module access are managed in **Staff Roles and Permissions**. Accounts use separate credentials from MySQL.
- Hosts register at `/#/rental-host` through **List Your Property** or **Build Your Rental Stay**. The property form can preview its coordinates on a map, and the publication checklist shows which requirements are missing or reviewed. Use **Pricing** to update nightly rates and applicable taxes and **Availability Calendar** to adjust stock. A publishable application needs contact and property details, coordinates, a photo, identity and ownership or authorization documents, a room category, and priced availability. Temporary lodging additionally requires permission and safety documents and a sanitation plan. Authorized group accommodation also requires permission evidence. Document access is scoped to the host or authorized reviewers. An admin must mark required documents reviewed and explicitly approve publication.
- For calendar changes, use a signed stock adjustment to add or remove unsold units. Set it to zero to update pricing only. Holds and confirmed bookings count toward registered capacity.
- Commission is snapshotted when a new booking is confirmed. Expected refunds reduce balances. Payouts record completed external transfers using a unique reference, and the dashboard does not initiate bank transfers. Booking exports include up to 5,000 filtered records and omit guest contact details.
- Admin changes, verification document access, and report exports are audited. Use HTTPS with `NODE_ENV=production` and a matching `APP_ORIGIN` for the operations session and publishing APIs.

## Hotel partner portal

Register at `/#/hotel-partner` with owner and business contact information. Select **My Properties** to add the hotel address, map coordinates, operating details, cancellation terms, stay limits, rooms, and photographs. Hotel applications require identity, ownership or authorization, applicable business, and safety documents. A reviewer must mark the documents reviewed and approve the listing before publication. Reopening an approved listing for edits removes it from search until reviewed again. Existing reservations remain accessible.

Use **Room Inventory Calendar** to adjust unsold capacity and block or reopen dates. Use **Seasonal Pricing** to update rates and taxes for a date range without changing stock. A block stops new reservations and leaves existing holds and bookings in place. Minimum and maximum stay lengths apply to both search and checkout.

The portal shows confirmed and cancelled reservations, check-in and check-out, property-specific group enquiries, reviews from verified stays, commission and payout records, and booking CSV exports. Guests can submit a group enquiry from the live hotel page. Staff can also assign a group enquiry to the property. Booking emails use the business email and the notification preference on the profile, with delivery through the existing SMTP worker.

## Bulk group stays

Use `/#/group-stays` or the group links on accommodation search and live hotel pages. The form accepts groups of 10 to 5,000 and records date, budget, room or bed needs, room allocations, diet, transport and accessibility preferences. The admin **Bulk Booking Enquiries** queue supports staff and property assignment, contact, and quoting. A hotel partner can quote only for an enquiry assigned to their property.

Matching checks published inventory across every night, room capacity, blocked dates, stay limits and recorded meal amenities. The organiser and property should agree any individual bed allocations, accessibility needs, meals, and transport in the quote terms. Each quote reserves one room category at one property and uses full online payment. Operators set the quote expiry. The accommodation price and tax come from the nightly calendar and are checked again when the guest accepts. Acceptance uses a 15-minute inventory hold and confirmation follows the signed Razorpay capture event.

Use the private link immediately after generating a quote to share it manually. To email quote links automatically, configure `APP_ORIGIN`, `SMTP_URL` and `SMTP_FROM`. The customer must use the browser that accepted the quote to revisit a pending payment or retrieve its reservation reference. An expired or replaced quote cannot create a new hold. The normal cancellation and refund workflow applies to the resulting reservation.

## Cab transport and pure veg directory

Run `npm run db:migrate` to add transport and directory tables. The cab form at `/#/cabs` issues a private status link. Keep it to revisit assignment, confirmed fare and partner contact. Each enquiry is assigned to one vehicle. The site records the enquiry and the agreed fare. Customers arrange payment directly with the partner.

Cab operators register at `/#/cab-partner` and add service areas, vehicles and drivers. Upload the operator permit, vehicle registration and insurance, and driver licence in **Document Verification**. Staff with Cab Partner Management access review documents and verify operators. **Review transport enquiries** assigns an eligible driver and vehicle. Assignment requires documents valid on the departure date, sufficient seats and no overlapping trip. Partners accept or decline assignments and record completion. Earnings are the agreed fares for completed trips.

In the admin **Restaurant Management** section, add a draft restaurant, enter its hours, contact and map coordinates, and record any distances to hotels and landmarks. Confirm pure veg verification and enter a review note before approval. Editing approved details returns the listing to draft. The public directory at `/#/restaurants` supports area, Jain food, Satvik meals and group-capacity filters. From a live hotel page it also shows restaurants with a recorded distance from that hotel.

## Languages, search indexing, and pilgrim assistance

The navbar language selector uses English, Marathi and Hindi. Maintain the interface phrases in `dist/site-strings.js` and public titles and descriptions in `dist/site-routes.js`. The browser retains the language while navigating. Property descriptions and other owner-entered content retain their submitted language.

Serve the public pages through the Node application. Set `SITE_ORIGIN` to the public origin (or use `APP_ORIGIN`) so canonical links, hreflang URLs, robots.txt and sitemap.xml use the right domain. Marathi and Hindi pages use `/mr` and `/hi` prefixes. Approved properties have ID-and-slug URLs and lodging structured data. The sitemap includes only crawlable public pages and approved records. The starter listing photos use responsive WebP variants with lazy loading.

The `/pilgrim-guide` page reads from **CMS Management ? Pilgrim assistance CMS**. The migration seeds translated entries with official authority links and review dates. Operators can edit, publish or archive entries, set an expiry, and must confirm the official source before publication. Changing interface translations does not change CMS copy.

## Validation

```sh
npm run check
node --check dist/premium.js
```

## Images

Local Indian-style accommodation images are AI-generated illustrations of fictional properties. Destination photographs are historical images from Wikimedia Commons; photographer and license credits are displayed in the site footer. They do not depict the 2027 event.

## Backend architecture and deployment

The server uses the existing Node HTTP router with a pooled MySQL 8 connection (`mysql2`). `booking-engine.cjs` owns transactional inventory locking, server-side quotes, holds, payment verification, and idempotency. `operations-auth.cjs` provides scrypt password authentication, secure sessions, CSRF protection, and backend-enforced RBAC. Domain modules are mounted through `operations-http.cjs` and `booking-http.cjs`.

Run `npm.cmd run db:migrate` after configuring `.env`. Migrations are tracked in `mks_schema_migrations`; `migrations/001-platform.sql` adds property image metadata, durable idempotency responses, notifications, CMS versions, request logs, and rate-limit storage. `npm.cmd run db:status` shows applied versions. Never commit `.env`, payment keys, SMTP credentials, or admin credentials.

Production checklist: use MySQL with TLS and backups, `APP_ORIGIN`/`SITE_ORIGIN` on HTTPS, a reverse proxy with TLS and request limits, object storage/CDN for large images, Redis via `REDIS_URL` for shared cache/rate limiting, a managed queue for notification/refund workers, centralized structured logs and alerts, and a WAF. The local fallback cache is intentionally bounded and must not be relied on across multiple instances. Health probes are `/healthz` and `/readyz`. API errors include `X-Request-Id`; authorization is checked on every protected route.

Before launch, run schema migrations, create the first admin with `npm.cmd run admin:create`, configure Razorpay webhook signing and SMTP, provision object storage, load-test search and booking contention, and verify backup restore and refund reconciliation procedures.
