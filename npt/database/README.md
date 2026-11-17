# NPT shared destination catalog

Built 2026-11-17 in the existing NPT Supabase project. Additive changes only; no trip data or visibility was changed. This catalog is public read-only. Only trusted backend/database operators can write it.

## Coverage at import
- 475 NPS unit records, including 62 national-park records representing 63 parks (Sequoia and Kings Canyon share one NPS unit).
- 3,909 state-park inventory entries grouped by normalized name and state from 6,670 PAD-US 4.1 parcels across 52 state/territory codes. These are source inventory groups, not an independently verified park count.
- Banff National Park.
- 679 campgrounds: 665 from NPS, 14 Banff frontcountry campgrounds.
- 3,717 attraction/activity-to-park associations: 3,464 distinct NPS activity IDs and 11 Banff attractions. 112 of the 3,576 downloaded NPS activity records had no matching related park and were not imported.
- 8,665 photo references, retaining available source captions and credits. URLs have not all been individually tested. Photos remain remote; rights are not implied by their presence in an agency feed.
- Individual campsite table is ready but empty.

## Tables
npt_parks, npt_campgrounds, npt_attractions, npt_catalog_photos, npt_campsites, npt_catalog_sources, npt_catalog_imports.

Parks connect to campgrounds and attractions by foreign keys. Photo rows belong to exactly one park, campground, or attraction. Every imported record has a source key and stable source record ID. Imported timestamps distinguish retrieval from independent source verification.

The catalog preserves available fees, hours and date exceptions, booking URLs and notes, campsite counts, public operator contact information, amenities, accessibility, RV/trailer limits, seasons and activity durations. A zero source length is treated as unknown, not a zero-foot limit. Drinking water and dump stations never imply water/sewer hookups. Unknown fit is excluded when a length is requested unless include_unknown_fit=true.

## Nearby search
Use RPC npt_nearby_campgrounds with center_lat, center_lon, radius_miles (default 30; max 250), required_rv_length_ft, require_full_hookups, include_unknown_fit and result_limit (default 50; max 200).

Distance is geographic straight-line distance, NOT road miles or driving time. PostGIS spatial indexes support radius and nearest-neighbor queries. The query is SECURITY INVOKER and works for guests while enforcing catalog RLS. Frontend replacement search is not wired up in this database-only change.

State-park points are largest-parcel centroids, not entrances. Banff campground points are centers of the official embedded maps, not confirmed gate coordinates. Banff attraction coordinates are pending. Do not route vehicles to these points as verified entrances.

## Known gaps
Private/KOA campground coverage, most state campground details, individual campsites, exhaustive attraction coverage, verified entrance points, live reservation inventory, current security-incident research and individually curated best-photo order remain incomplete. Security review and availability default to unknown. A source snapshot does not establish the absence of incidents or a campsite being available.

Banff operational dates are explicitly dated 2026 and must not be projected into 2028. NPS calendars also contain date-specific exceptions. Unknown data should be visible to travelers and must not be converted to false assurance.

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
