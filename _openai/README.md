# ChatGPT Ads (OpenAI) — lead_created

Branch `openai-ads-lead`. Not merged, migration not applied, nothing switched on.
Folders starting with `_` are not published by GitHub Pages.

## What goes where

| Piece | Where |
|---|---|
| Pixel ID (public) | `site.js` → `OAI_PIXEL_ID` (the only Pixel on the site) and `subnex_private.oai_config.pixel_id` |
| Conversions API key (secret) | Supabase Vault, secret name `openai_ads_capi_key`. Never in the repo or the chat |
| Event | `lead_created`, data `{ type: 'customer_action' }` |
| Event id | `lead_event_id` from `subnex_web_booking` — Pixel `event_id` and API `id` |

## States in `subnex_private.oai_events`

| state | meaning |
|---|---|
| `pending` | waiting for the worker (cron `subnex-openai-capi`, every minute) |
| `sending` | handed to OpenAI, reply not read yet |
| `validated` | **validate_only check passed. OpenAI did NOT save anything.** Proves the request format and key only |
| `sent` | real event accepted by OpenAI |
| `failed` | 400, or 5 failed attempts |
| `skipped` | `consent_revoked`, or older than 7 days |

## Publication order (each step needs Kostia's "yes")

1. **Pixel ID.** Paste it into `site.js` (`OAI_PIXEL_ID`). Commit on this branch.
2. **Migration.** Supabase SQL Editor → run `100_openai_ads.sql` (safe to run twice). Then:
   ```sql
   update subnex_private.oai_config
      set pixel_id = '<PIXEL ID>', test_email = 'collections+oaitest@subnex.co.uk'
    where singleton;
   ```
   `enabled` stays false. Production bookings now return `new`/`lead_event_id`; the live site ignores them.
3. **Key.** Kostia: `select vault.create_secret('<key>', 'openai_ads_capi_key');`
4. **API format check (nothing saved by OpenAI).**
   `update subnex_private.oai_config set enabled = true where singleton;` (validate_only is still true).
   Book once on the live site with the test email. Expect: the request closes at once as `operator_removed`
   (no emails, no route), and within ~2 minutes
   `select state, http_status, error from subnex_private.oai_events order by created_at desc limit 3;`
   shows `validated`. This proves key + format only.
5. **Merge the branch to `main`** (site with Pixel). Pages deploys in a minute or two.
6. **One real end-to-end test** — do it before the conversion goal is attached to a live campaign:
   ```sql
   update subnex_private.oai_config set test_validate_only = false where singleton;
   ```
   Open `https://subnex.co.uk/collect/?oai_debug=1`, Accept cookies, book with the test email and a CF postcode.
   - browser console: one `lead_created` with an `event_id`;
   - `oai_events`: the same id goes to `sent`;
   - Ads Manager event monitoring (or `GET /v1/conversions/events?pixel_id=…`, ~last 15 minutes):
     the id appears as `pixel_sdk` and as `server_to_server`.

   Then set `test_validate_only = true` again. The request is still closed — no customer order is created.
   What this does NOT prove: that OpenAI merged the two into one (the documentation says it keeps the
   first; event monitoring shows arrivals, not the merge), and it says nothing about ad attribution —
   there was no real ad click. A one-off real test event may count as one conversion in OpenAI.
7. **Negative checks** on the live site, all with the test email:
   wrong postcode / invalid email (form error, no event);
   BS postcode (not served, no event);
   Reject in the banner (no request to `bzrcdn.openai.com`, no row in `oai_events`);
   `/privacy/` → "Change your cookie choice" after a booking (pending row → `skipped / consent_revoked`).
   Duplicates cannot be tested live without a fake order: a test request is closed at once, so it never
   becomes a "twin", and repeating a real customer's address would email that customer. Duplicates are covered
   by the local tests; in production check `select count(*) from subnex_private.web_bookings
   where outcome = 'duplicate' and oai_event_id is not null;` stays 0.
8. **Real sending:** `update subnex_private.oai_config set validate_only = false where singleton;`
9. **Attribution** is confirmed only by a real ChatGPT ad click: the booking's `web_bookings.ad->>'oppref'`
   is set and the conversion shows on the campaign in Ads Manager. `oppref=test123` is artificial.

Switch everything off at any time: `update subnex_private.oai_config set enabled = false where singleton;`
(the site Pixel still fires for consenting visitors until `OAI_PIXEL_ID` is emptied).

## Local checks

- SQL (Postgres 16): `00_stub.sql` → `fn_web_booking.sql` (copy of production, same md5) → `100_openai_ads.sql` twice → `01_scenarios.sql`.
- Browser: `PW_CHROMIUM=… node _openai/oai.smoke.mjs <site folder>` (all external calls mocked).

## Separate proposal (not in this branch): Google Ads counts duplicates

Today `SubnexSite.lead` sends the Google conversion whenever the form ends on the thank-you screen —
including duplicates, honeypot bots and the case where only the Web3Forms backup copy succeeded.
Proposed one-line change: send the Google conversion only when `res.new === true` (same rule as OpenAI).
Effect: fewer, truer conversions in Google Ads; Maximise conversions will recalibrate for a few days.
Needs Kostia's decision because it changes the numbers bidding relies on.
