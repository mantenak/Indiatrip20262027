# NPT shared destination catalog

Built 2026-11-17 in the existing NPT Supabase project. Additive changes only; no trip data or visibility was changed. This catalog is public read-only. Only trusted backend/database operators can write it.

## Coverage at import
- 475 NPS unit records, including 62 national-park records representing 63 parks (Sequoia and Kings Canyon share one NPS unit).
- 3,909 state-park inventory entries grouped by normalized name and state from 6,670 PAD-US 4.1 parcels across 52 state/territory codes. These are source inventory groups, not an independently verified park count. Twelve Florida state-park campground records have now been enriched from official park pages.
- Banff National Park.
- 753 campgrounds currently in the database: 665 from NPS, 14 Banff frontcountry campgrounds, 3 KOA, 59 Sun Outdoors, and 12 Florida state-park campgrounds. Private-chain coverage is still a sample, not a nationwide import.
- 3,717 attraction/activity-to-park associations: 3,464 distinct NPS activity IDs and 11 Banff attractions. 112 of the 3,576 downloaded NPS activity records had no matching related park and were not imported.
- 8,665 photo references, retaining available source captions and credits. URLs have not all been individually tested. Photos remain remote; rights are not implied by their presence in an agency feed.
- Individual campsite table is ready but empty.

## Tables
npt_parks, npt_campgrounds, npt_attractions, npt_catalog_photos, npt_campsites, npt_catalog_sources, npt_catalog_imports.

Parks connect to campgrounds and attractions by foreign keys. Photo rows belong to exactly one park, campground, or attraction. Every imported record has a source key and stable source record ID. Imported timestamps distinguish retrieval from independent source verification.

The catalog preserves available campground-level price ranges or typical nightly averages, hours and date exceptions, booking URLs and notes, campsite counts, public operator contact information, amenities, accessibility, RV/trailer limits, seasons and activity durations. Individual-site records focus on RV fit and hookups; per-lot prices are not required. A zero source length is treated as unknown, not a zero-foot limit. Drinking water and dump stations never imply water/sewer hookups. Unknown fit is excluded when a length is requested unless include_unknown_fit=true.

## Nearby search
Use RPC npt_nearby_campgrounds with center_lat, center_lon, radius_miles (default 30; max 250), required_rv_length_ft, require_full_hookups, include_unknown_fit and result_limit (default 50; max 200).

Distance is geographic straight-line distance, NOT road miles or driving time. PostGIS spatial indexes support radius and nearest-neighbor queries. The query is SECURITY INVOKER and works for guests while enforcing catalog RLS. Frontend replacement search is not wired up in this database-only change.

State-park points are largest-parcel centroids, not entrances. Banff campground points are centers of the official embedded maps, not confirmed gate coordinates. Banff attraction coordinates are pending. Do not route vehicles to these points as verified entrances.

## Known gaps
Private campground coverage is incomplete: KOA (3 records) and Sun Outdoors (59 records) are samples, and the other registered operators have not yet been imported. Florida has 12 campground-level records; most state campground details and all individual campsite records remain incomplete. Exact coordinates, site-specific fees, live reservation inventory, exhaustive attraction coverage, verified entrance points, current security-incident research and individually curated best-photo order also remain incomplete. Security review and availability default to unknown. A source snapshot does not establish the absence of incidents or a campsite being available.

Banff operational dates are explicitly dated 2026 and must not be projected into 2028. NPS calendars also contain date-specific exceptions. Unknown data should be visible to travelers and must not be converted to false assurance.

## State-park campground enrichment: first import
Twelve Florida State Parks campground records were added from official park pages, including Blue Hole at Florida Caverns, Highlands Hammock, John Pennekamp, Ochlockonee River, St. Andrews, Anastasia, Big Lagoon, Blackwater River, Lake Manatee, Myakka River, Oscar Scherer, and Rainbow Springs. The import captures published RV limits, hookup information, site counts or site-group differences, and direct park and reservation links where available. Unknown values remain null. It does not create individual-site records from campground-level summaries; `npt_campsites` remains empty until official reservation pages provide individual site identifiers and attributes. Coordinates and park-specific prices are also pending verification. The project owner reports that the all-region Florida search shows 372 campground results; reconcile those results against the official park inventory and deduplicate facilities before treating 372 as a verified unique-campground count.

Source pages:
- [Florida Caverns](https://www.floridastateparks.org/parks-and-trails/florida-caverns-state-park/experiences-amenities)
- [Highlands Hammock](https://www.floridastateparks.org/parks-and-trails/highlands-hammock-state-park/experiences-amenities)
- [John Pennekamp](https://www.floridastateparks.org/parks-and-trails/john-pennekamp-coral-reef-state-park/experiences-amenities)
- [Ochlockonee River](https://www.floridastateparks.org/parks-and-trails/ochlockonee-river-state-park/experiences-amenities)
- [St. Andrews](https://www.floridastateparks.org/parks-and-trails/st-andrews-state-park/experiences-amenities-0)
- [Florida State Parks reservations](https://reserve.floridastateparks.org/Web/Activities/PlanYourVisit.aspx)

## Catalog Manager
Signed-in site administrators see **Catalog Manager** in the main navigation. It has separate editable lists for national parks, state parks, other park units, campgrounds, individual campsites, attractions, and source directories. Administrators can search, add, edit, or delete records. Campground fees are captured as a campground-level range or average; individual campsite editing focuses on fit and hookups.

Writes are protected by the `npt_catalog_admins` allowlist and `npt_is_catalog_admin()` row-level-security policies. The current site owner is seeded as an administrator. The browser uses only the public Supabase key; no service-role key is shipped to the site.

The Catalog Manager currently provides record management. On-demand source refresh adapters are a separate next step; registering an operator directory does not yet crawl or import its locations.

## Private campground discovery sources
The following official operator directories are registered in `npt_catalog_sources` and `sources.sql` as starting points for an on-demand catalog refresh:

- [KOA](https://koa.com/campgrounds/)
- [Equity LifeStyle Properties (ELS)](https://www.equitylifestyleproperties.com/our-portfolio/rv-portfolio/)
- [Adventure Bound Camping Resorts](https://www.abcamping.com/)
- [Sun Outdoors](https://www.sunoutdoors.com/locations)
- [Thousand Trails / Encore](https://thousandtrails.com/memberships)
- [Yogi Bear’s Jellystone Park Camp-Resorts](https://www.campjellystone.com/locations)
- [Blue Water Development](https://bwdc.com/real-estate-development-portfolio/)
- [Spacious Skies Campgrounds](https://spaciousskiescampgrounds.com/our-campgrounds/)

These directory registrations identify where to discover locations; they do not mean every campground or amenity has been imported or verified. Follow each listing to its official campground and booking pages for RV/site limits, amp service, water and sewer hookups, fee details, and reservation links. Mark unavailable fields unknown and retain the direct source URL. Do not import date-dependent booking prices as fixed nightly rates. Blue Water, ELS/Encore, KOA, Jellystone, and other portfolios can overlap, so physical campgrounds must be deduplicated while retaining verified brand/operator relationships.

## Reproduce the initial import
Python standard library only. Set NPT_CATALOG_WORKDIR to a scratch snapshot directory, optionally NPS_API_KEY for sustained usage (default public DEMO_KEY).
Run fetch_catalog.py, prepare_import.py, prepare_regions.py, then prepare_banff_attractions.py. Review generated npt-catalog/*.sql and apply in lexical order using the authenticated Supabase connector. First register source rows from sources.sql. Scripts write SQL but do not connect to the database or contain credentials.

Schema changes are recorded in Supabase migrations npt_geographic_catalog, npt_nearby_campground_search, and npt_catalog_site_details_and_search_permissions. catalog-schema.sql is the concatenated applied additive SQL, for review/reproduction after the earlier NPT schema; do not rerun it against the populated database.

These scripts are INITIAL import tooling. Most conflict handlers skip existing records; they are not a scheduled refresh/synchronization system. Review changed source formats before any rerun. Retain source-specific overrides in a future refresh design.

## Validation
Verified guest nearby search returns Madison at its location; radius bounds; 33-foot filter excludes its reported 30-foot limit; unknown-fit opt-in; full-hookup filtering; guest catalog reads; no anonymous or authenticated catalog writes; anonymous access returns zero non-public trips. Catalog tables have RLS and spatial/foreign-key indexes. Security advisor reports no catalog findings.

Sources:
- https://www.nps.gov/subjects/developer/index.htm
- https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-web-services
- https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Manager_Name_PADUS/FeatureServer
- https://parks.canada.ca/pn-np/ab/banff/activ/camping
- https://parks.canada.ca/pn-np/ab/banff/visit/les10-top10
