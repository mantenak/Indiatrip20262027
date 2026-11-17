import os
import json,re,html,pathlib
ROOT=pathlib.Path(os.environ.get('NPT_CATALOG_WORKDIR','.catalog-work'));OUT=ROOT/'npt-catalog';OUT.mkdir(parents=True,exist_ok=True)
def txt(s): return html.unescape(re.sub('<[^>]+>',' ',s or '')).strip()
def num(s):
 try:return float(s) if s not in ['',None] else None
 except:return None
def pos(s):
 n=num(s);return n if n and n>0 else None
def boolean(s):return {'1':True,'0':False,'true':True,'false':False}.get(str(s).lower())
def lit(x):return "'"+json.dumps(x,ensure_ascii=False).replace("'","''")+"'::jsonb"
def batch(name,rows,sql,n=100):
 for i in range(0,len(rows),n): (OUT/(name+'-'+str(i//n).zfill(3)+'.sql')).write_text(sql.replace('__DATA__',lit(rows[i:i+n])))
parks=json.load(open(ROOT/'npt-parks.json'))['data'];codes={p['parkCode'] for p in parks}
pr=[];photos=[]
def pics(p,kind,key,park=None):
 for i,x in enumerate(p.get('images',[])):
  if not x.get('url','').startswith('https://'):continue
  photos.append(dict(kind=kind,key=key,park=park,url=x['url'],alt=txt(x.get('altText')),caption=txt(x.get('caption')),credit=txt(x.get('credit')),source_url=p.get('url'),sort_order=i+1))
for p in parks:
 des=p['designation'];pr.append(dict(name=p['fullName'],designation='national_park' if des in ['National Park','National Park & Preserve','National Parks','National and State Parks'] else 'other',region=p['states'],latitude=num(p['latitude']),longitude=num(p['longitude']),official_url=p['url'],official_id=p['parkCode'],source_record_id=p['parkCode'],description=txt(p['description']),metadata={k:p.get(k) for k in ['designation','operatingHours','entranceFees','entrancePasses','activities','topics','contacts','addresses','directionsInfo','directionsUrl','weatherInfo']}));pics(p,'park',p['parkCode'])
batch('10-parks',pr,"""insert into public.npt_parks(name,designation,region,latitude,longitude,official_url,official_id,source_key,source_record_id,description,metadata,imported_at)
select x.name,x.designation,x.region,x.latitude,x.longitude,x.official_url,x.official_id,'nps',x.source_record_id,x.description,x.metadata,now() from jsonb_to_recordset(__DATA__) x(name text,designation text,region text,latitude float8,longitude float8,official_url text,official_id text,source_record_id text,description text,metadata jsonb) on conflict(source_key,source_record_id) do update set name=excluded.name,description=excluded.description,metadata=excluded.metadata,imported_at=now();""")
camps=[]
for c in json.load(open(ROOT/'npt-campgrounds.json'))['data']:
 a=c.get('accessibility',{});cs=c.get('campsites',{});code=c.get('parkCode');total=pos(cs.get('totalSites')); addresses=c.get('addresses',[])
 camps.append(dict(name=c['name'],park=code,source_record_id=c['id'],latitude=num(c['latitude']),longitude=num(c['longitude']),description=txt(c['description']),official_url=c.get('url') or None,reservation_url=c.get('reservationUrl') or None,region=addresses[0].get('stateCode') if addresses else None,rv_allowed=boolean(a.get('rvAllowed')) if total else None,trailer_allowed=boolean(a.get('trailerAllowed')) if total else None,max_rv_length_ft=pos(a.get('rvMaxLength')),max_trailer_length_ft=pos(a.get('trailerMaxLength')),electric_hookups=(num(cs.get('electricalHookups'))>0) if total and num(cs.get('electricalHookups')) is not None else None,amenities=c.get('amenities',{}),fees=c.get('fees',[]),operating_hours=c.get('operatingHours',[]),reservation_notes=txt(c.get('reservationInfo')),accessibility=a,metadata={k:c.get(k) for k in ['campsites','contacts','addresses','directionsOverview','directionsUrl','regulationsOverview','regulationsurl','weatherOverview','numberOfSitesReservable','numberOfSitesFirstComeFirstServe','parkCode']}));pics(c,'campground',c['id'])
fields='name text,park text,source_record_id text,latitude float8,longitude float8,description text,official_url text,reservation_url text,region text,rv_allowed boolean,trailer_allowed boolean,max_rv_length_ft numeric,max_trailer_length_ft numeric,electric_hookups boolean,amenities jsonb,fees jsonb,operating_hours jsonb,reservation_notes text,accessibility jsonb,metadata jsonb'
cols=[f.split()[0] for f in fields.split(',') if not f.startswith('park ')]
batch('20-campgrounds',camps,'insert into public.npt_campgrounds(park_id,source_key,'+','.join(cols)+') select p.id,\'nps\','+','.join('x.'+c for c in cols)+' from jsonb_to_recordset(__DATA__) x('+fields+") left join public.npt_parks p on p.source_key='nps' and p.source_record_id=x.park on conflict(source_key,source_record_id) do nothing;")
attrs=[]
for file in [ROOT/'npt-thingstodo.json']+sorted(ROOT.glob('npt-thingstodo-*.json')):
 for a in json.load(open(file))['data']:
  for p in a.get('relatedParks',[]):
   code=p['parkCode']
   if code not in codes:continue
   attrs.append(dict(name=a['title'],park=code,source_record_id=a['id'],description=txt(a.get('shortDescription')),latitude=num(a.get('latitude')),longitude=num(a.get('longitude')),official_url=a.get('url'),accessibility={'information':txt(a.get('accessibilityInformation'))},seasonality={'seasons':a.get('season',[]),'description':txt(a.get('seasonDescription'))},metadata={k:a.get(k) for k in ['duration','durationDescription','activities','tags','location','locationDescription','isReservationRequired','reservationDescription','doFeesApply','feeDescription','petsDescription','arePetsPermitted','arePetsPermittedWithRestrictions','timeOfDay','ageDescription']}));pics(a,'attraction',a['id'],code)
fields='name text,park text,source_record_id text,description text,latitude float8,longitude float8,official_url text,accessibility jsonb,seasonality jsonb,metadata jsonb';cols=[f.split()[0] for f in fields.split(',') if not f.startswith('park ')]
batch('30-attractions',attrs,'insert into public.npt_attractions(park_id,source_key,attraction_type,'+','.join(cols)+') select p.id,\'nps\',\'activity_or_attraction\','+','.join('x.'+c for c in cols)+' from jsonb_to_recordset(__DATA__) x('+fields+") join public.npt_parks p on p.source_key='nps' and p.source_record_id=x.park on conflict(source_key,source_record_id,park_id) do nothing;",150)
for kind,table,fk in [('park','npt_parks','park_id'),('campground','npt_campgrounds','campground_id'),('attraction','npt_attractions','attraction_id')]:
 rows=[p for p in photos if p['kind']==kind]
 join="join public.npt_parks park on park.id=t.park_id and park.source_record_id=x.park" if kind=='attraction' else ''
 batch('40-photos-'+kind,rows,f"insert into public.npt_catalog_photos({fk},url,alt_text,caption,credit,source_url,sort_order,license_notes) select t.id,x.url,x.alt,x.caption,x.credit,x.source_url,x.sort_order,'Source attribution retained; image-specific rights apply.' from jsonb_to_recordset(__DATA__) x(key text,park text,url text,alt text,caption text,credit text,source_url text,sort_order int) join public.{table} t on t.source_key='nps' and t.source_record_id=x.key {join} on conflict do nothing;",300)
print({'parks':len(pr),'campgrounds':len(camps),'attraction_park_links':len(attrs),'photos':len(photos),'sql_files':len(list(OUT.glob('*.sql')))})
