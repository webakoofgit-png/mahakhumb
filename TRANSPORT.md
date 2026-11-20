# Cab booking readiness

The existing `/transport#/cabs` route now keeps the Mahakumbh Stage shell and adds a responsive booking panel, map-provider integration boundary, coordinate-based backend fare estimates, configurable vehicle categories, and transparent fare breakdowns. Existing enquiry/status and cab-partner workflows remain compatible.

## Implemented

- Seven configurable categories: Bike Taxi, Auto Rickshaw, Mini Cab, Sedan, SUV, Tempo Traveller and Luxury Cab.
- Backend fare rules in `mks_cab_fare_rules`; fare calculation uses base, route distance, duration, peak surcharge, toll and tax.
- Public `POST /api/operations/transport/fare`, validating coordinates and calculating totals server-side.
- Existing authenticated partner assignment atomically checks verified documents, capacity, vehicle/driver overlap and assignment state.
- Existing private status links, partner dashboards, document review and admin trip management preserved.
- Responsive two-column booking/map presentation with mobile stacking, loading and error states.

## Production prerequisites

The local page deliberately does not fake geocoding, route lines, GPS, driver availability or live tracking. Configure an approved Google Maps or equivalent provider through a server-side proxy, add authenticated driver location ingestion, Socket.IO/WebSocket updates, ride request timeouts, OTP/SOS workflows, payment capture/refund integration and consented location sharing before advertising real-time ride-hailing. No API key is stored in frontend code.

Run `npm.cmd run db:migrate` to apply `migrations/002-transport-platform.sql`. Test the estimate endpoint with valid map coordinates before staging. Configure service zones and route restrictions from verified authority sources through the admin CMS; do not hardcode temporary Kumbh restrictions.
