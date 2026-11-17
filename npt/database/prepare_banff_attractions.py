import os
import pathlib
ROOT=pathlib.Path(os.environ.get('NPT_CATALOG_WORKDIR','.catalog-work'))
import os
import re,html,json,hashlib,pathlib,urllib.parse
s=open(ROOT/'npt-banff-attractions.html').read();rows=[]
for panel in re.findall('<section class="panel panel-default">(.*?)</section>',s,re.S):
 m=re.search('<h3[^>]*>.*?<a href="([^"]+)">(.*?)</a>',panel,re.S)
 if not m:continue
 title=html.unescape(re.sub('<[^>]+>','',m[2])).strip();name=re.sub(r'^(Visit |Discover |Soak in |Meander along |Summit |Bike |Explore |Drive )(the )?','',title)
 im=re.search('<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"',panel,re.S)
 rows.append(dict(name=name,key=hashlib.sha256(name.encode()).hexdigest(),url=urllib.parse.urljoin('https://parks.canada.ca',html.unescape(m[1])),photo=html.unescape(im[1]) if im else None,alt=html.unescape(im[2]) if im else None))
rows.append(dict(name='Moraine Lake',key='moraine-lake',url='https://parks.canada.ca/pn-np/ab/banff/visit/les10-top10/louise',photo=None,alt=None))
j="'"+json.dumps(rows).replace("'","''")+"'::jsonb"
sql="insert into public.npt_attractions(park_id,name,attraction_type,official_url,source_key,source_record_id,metadata) select p.id,x.name,'attraction',x.url,'parks_canada',x.key,'{\"coverage_status\":\"official_listing_coordinates_pending\"}'::jsonb from jsonb_to_recordset("+j+") x(name text,key text,url text) cross join public.npt_parks p where p.source_key='parks_canada' and p.source_record_id='banff' on conflict(source_key,source_record_id,park_id) do nothing;\n"
sql+="insert into public.npt_catalog_photos(attraction_id,url,alt_text,source_url,sort_order,license_notes) select a.id,x.photo,x.alt,x.url,1,'Parks Canada source; image-specific reuse rights require review.' from jsonb_to_recordset("+j+") x(key text,photo text,alt text,url text) join public.npt_attractions a on a.source_key='parks_canada' and a.source_record_id=x.key where x.photo is not null on conflict do nothing;"
(ROOT/'npt-catalog'/'61-banff-attractions.sql').write_text(sql);print('Banff attractions',len(rows));print([r['name'] for r in rows])
