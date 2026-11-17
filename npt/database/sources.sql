insert into public.npt_catalog_sources(key,name,url,license_notes,coverage_notes) values
('nps','National Park Service Data API','https://www.nps.gov/subjects/developer/index.htm','Retain image-specific rights and credits.','NPS API snapshot; not exhaustive national campground coverage.'),
('padus','USGS PAD-US 4.1','https://doi.org/10.5066/P96WBCHS','USGS public data.','State park inventory; centroids are not entrances.'),
('parks_canada','Parks Canada','https://parks.canada.ca/pn-np/ab/banff','Image-specific rights require review.','Initial Banff official records.')
on conflict(key) do nothing;