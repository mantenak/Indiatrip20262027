# National Park Trip (NPT) Web

This subdirectory currently lives under the GitHub repository `mantenak/Indiatrip20262027`. It should eventually move into its own NPT repository when the full app migration is complete.

## Web application
- `index.html` — trip builder, trip/itinerary viewer, legacy local JSON importer.
- `cloud.js` — Supabase Auth, user profile creation, cloud trip ownership, public trips, private imports, and public/unlisted links.
- `supabase/001_npt_schema.sql` — initial tables and row-level security, applied to the linked project.
- `supabase/functions/npt-unlisted-read/index.ts` — deployed Edge Function. Its privileged key is an Edge environment secret **not stored in GitHub**.

## Supabase
- Project: National Park Trip
- Project ref: `asyrsvgdiloleodlzrfu`
- Region: US East (Ohio)
- Authentication: Supabase Email Magic Link (first testing with project organization members)
- Database: public.npt_profiles, public.npt_trips, public.npt_trip_links, public.npt_parks
- Public trips: readable anonymously.
- Private trips: owner only via RLS.
- Unlisted trips: share token checked server-side by Edge Function; changing visibility to Private makes the link stop working.
- Invited-only collaboration: **not implemented**; currently disabled in the UI.

## Required one-time hosted Auth configuration
Dashboard: `https://supabase.com/dashboard/project/asyrsvgdiloleodlzrfu/auth/url-configuration`

Site URL: `https://mantenak.github.io/Indiatrip20262027/npt/`

Additional Redirect URL: `https://mantenak.github.io/Indiatrip20262027/npt/`

This is required for Magic Links to return to the published website instead of a localhost default. The GitHub Pages URL must also be active.

**For friends outside Supabase organization members:** configure **custom SMTP** or the Auth Send Email hook. Supabase's built-in email service restricts delivery to organization member email addresses and has a low testing limit. Do not disable email confirmation as a workaround.

## Restoring the original RV tour
1. Sign in to the NPT website.
2. Download the private `NPT_2028_Private_Trip_Import.json` from the ChatGPT conversation.
3. Click **Import Existing NPT Trip**; select that JSON file.
4. Confirm import into the account. It defaults to **Private**.
5. Review the 111-night seeded test itinerary, park stops, campgrounds, route estimates, security incident status, and reservation claims before publishing or booking.

Do not commit the private JSON backup into this public GitHub repository. Browser-only `npt-trips` drafts remain untouched and can be explicitly migrated by their owner after sign-in.

## Verification checklist
- Open NPT as a guest. Public trips should display without sign-in. No private trips should appear.
- Start Create Trip while logged out. Email sign-in should be required.
- Log in, create a private trip, reload, and confirm it persists from Supabase.
- In a separate user account, confirm the first user's private trip cannot be queried.
- Switch a test trip to Public; guests should now see it.
- Switch it to Unlisted, generate a link, verify only link-holders can open it.
- Make the trip Private again and verify the old link no longer opens it.
- Import the private 2028 JSON; check that it remains private and displays all itinerary sections.

**Current limitations:** GitHub Pages publication and live browser sign-in haven't been verified from this environment. A one-time Auth URL configuration, email delivery for external users, and a signed-in browser test remain pending.
