import os
import json,re,html,hashlib,pathlib,urllib.request
ROOT=pathlib.Path(os.environ.get('NPT_CATALOG_WORKDIR','.catalog-work'));O=ROOT/'npt-catalog';O.mkdir(parents=True,exist_ok=True)
def txt(s):return ' '.join(html.unescape(re.sub('<[^>]+>',' ',s or '')).split())
def lit(x):return "'"+json.dumps(x,ensure_ascii=False).replace("'","''")+"'::jsonb"
raw=json.load(open(ROOT/'npt-state-official.json')); groups={}
for r in raw:
 a=r['attributes'];name=a.get('Unit_Nm');region=a.get('State_Nm')
 if not name or not region:continue
 key=region+'|'+name.strip().casefold();g=groups.setdefault(key,[]);g.append(r)
rows=[]
for key,g in groups.items():
 r=max(g,key=lambda x:x['attributes'].get('GIS_Acres') or 0);a=r['attributes'];c=r.get('centroid',{})
 rows.append(dict(name=a['Unit_Nm'],region=a['State_Nm'],source_record_id=hashlib.sha256(key.encode()).hexdigest(),latitude=c.get('y'),longitude=c.get('x'),metadata={'coordinate_kind':'largest_parcel_centroid_not_entrance','parcel_count':len(g),'source_object_ids':[x['attributes']['OBJECTID'] for x in g],'manager':a.get('Mang_Name'),'inventory_version':'PAD-US 4.1','coverage_status':'inventory_record_needs_agency_validation'}))
for i in range(0,len(rows),300):
 sql="insert into public.npt_parks(name,designation,region,country,source_key,source_record_id,latitude,longitude,metadata,imported_at) select x.name,'state_park',x.region,'US','padus',x.source_record_id,x.latitude,x.longitude,x.metadata,now() from jsonb_to_recordset("+lit(rows[i:i+300])+") x(name text,region text,source_record_id text,latitude float8,longitude float8,metadata jsonb) on conflict(source_key,source_record_id) do nothing;"
 (O/('50-states-'+str(i//300).zfill(3)+'.sql')).write_text(sql)
s=open(ROOT/'npt-banff.html').read();camps=[]
table=s[s.find('Campgrounds in Banff National Park'):];table=table[:table.find('</table>')]
schedules={}
for tr in re.findall('<tr[^>]*>(.*?)</tr>',table,re.S):
 td=re.findall('<td[^>]*>(.*?)</td>',tr,re.S)
 if len(td)!=4:continue
 anchor=re.search('href="#([^"]+)"',td[0]);
 if anchor:schedules[anchor[1]]=[txt(x) for x in td[1:]]
for key,sch in schedules.items():
 m=re.search('id="'+re.escape(key)+'"[^>]*>(.*?)</strong>',s,re.S)
 if not m:continue
 section=s[m.start():];section=section[:section.find('</details>')]
 if '<table' not in section:continue
 name=txt(m[1]);cell=re.findall('<td[^>]*>(.*?)</td>',section,re.S);count=next((int(txt(x)) for x in cell if txt(x).isdigit()),None)
 services=[txt(x) for x in re.findall('<li[^>]*>(.*?)</li>',section[:section.find('</table>')],re.S)]
 ll=re.search('!2d(-?[0-9.]+)!3d(-?[0-9.]+)',section)
 site_type=sch[2];electric=True if site_type in ['Electrical','Full hookup'] else False if site_type=='Unserviced' else None
 camps.append(dict(name=name,source_record_id='banff-'+key,latitude=float(ll[2]) if ll else None,longitude=float(ll[1]) if ll else None,electric_hookups=electric,water_hookups=site_type=='Full hookup',sewer_hookups=site_type=='Full hookup',official_url='https://parks.canada.ca/pn-np/ab/banff/activ/camping#'+key,amenities={'services':services},metadata={'total_sites':count,'source_year':2026,'reservable_dates':sch[0],'operational_dates':sch[1],'site_type':site_type,'coordinate_kind':'official_embedded_map_center_not_confirmed_entrance'}))
sql="insert into public.npt_parks(name,designation,region,country,official_url,source_key,source_record_id,imported_at,metadata) values('Banff National Park','national_park_canada','AB','CA','https://parks.canada.ca/pn-np/ab/banff','parks_canada','banff',now(),'{\"coverage_status\":\"initial_official_records\"}') on conflict(source_key,source_record_id) do nothing;\n"
sql+="insert into public.npt_campgrounds(park_id,name,country,region,source_key,source_record_id,latitude,longitude,electric_hookups,water_hookups,sewer_hookups,official_url,reservation_url,operator,amenities,metadata) select p.id,x.name,'CA','AB','parks_canada',x.source_record_id,x.latitude,x.longitude,x.electric_hookups,x.water_hookups,x.sewer_hookups,x.official_url,'https://reservation.pc.gc.ca/','Parks Canada',x.amenities,x.metadata from jsonb_to_recordset("+lit(camps)+") x(name text,source_record_id text,latitude float8,longitude float8,electric_hookups boolean,water_hookups boolean,sewer_hookups boolean,official_url text,amenities jsonb,metadata jsonb) cross join public.npt_parks p where p.source_key='parks_canada' and p.source_record_id='banff' on conflict(source_key,source_record_id) do nothing;"
(O/'60-banff.sql').write_text(sql)
print({'state_park_groups':len(rows),'regions':len(set(r['region'] for r in rows)),'banff_campgrounds':len(camps),'banff_names':[x['name'] for x in camps]})
