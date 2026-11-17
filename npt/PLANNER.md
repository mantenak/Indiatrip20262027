# Catalog route planner

New Trip requires sign-in. New proposals are private and use the existing trip viewer. Editing uses owner checks and an updated_at comparison to prevent overwriting another device's changes.

The questionnaire includes preferred driving miles and maximum driving hours. Park selection uses rough geographic estimates; the requested road calculation uses OSRM standard driving routes, not RV clearance routing. Route legs exceeding preferences are highlighted. Campground replacements search a local radius, with separate RV and trailer length checks. Missing fit, availability, seasonal access, and security data remain unverified.

Preview Drive keeps View, playback, and Speed in the primary toolbar. Day navigation, stop selection, and road settings are expandable. Opening the preview does not start playback.

Initial chain import: 62 US Sun Outdoors directory records and 3 verified KOA records. Only 21 have source-verified coordinates. This is a starting sample, not complete national chain coverage. `chain-records.json` preserves the normalized source snapshot. Official photos remain source references with original rights.

Run calculation checks: `node npt/planner-core.test.cjs`.
