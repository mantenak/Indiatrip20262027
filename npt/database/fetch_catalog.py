"""Download official catalog inputs. Does not write to Supabase.
Set NPS_API_KEY for sustained use; DEMO_KEY is the public NPS demo credential.
Set NPT_CATALOG_WORKDIR to choose the snapshot directory.
"""
import json,os,pathlib,urllib.request,urllib.parse
ROOT=pathlib.Path(os.environ.get('NPT_CATALOG_WORKDIR','.catalog-work'));ROOT.mkdir(parents=True,exist_ok=True)
def get(url):
 with urllib.request.urlopen(url,timeout=90) as r:return json.load(r)
def save(name,data): (ROOT/name).write_text(json.dumps(data))
key=os.environ.get('NPS_API_KEY','DEMO_KEY')
for endpoint,limit in [('parks',500),('campgrounds',1000),('thingstodo',1000)]:
 start=0;seen=set()
 while True:
  q=urllib.parse.urlencode(dict(limit=limit,start=start,api_key=key))
  data=get('https://developer.nps.gov/api/v1/'+endpoint+'?'+q)
  assert 'data' in data and 'total' in data,'Incomplete NPS response'
  ids=[x['id'] for x in data['data']];assert not seen.intersection(ids),'Duplicate page';seen.update(ids)
  save('npt-'+endpoint+('-'+str(start) if start else '')+'.json',data)
  start+=len(data['data'])
  if start>=int(data['total']):break
  assert data['data'],'Empty page before total'
 print(endpoint,len(seen))
base='https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Manager_Name_PADUS/FeatureServer/0/query'
params=dict(f='json',where="Des_Tp='SP'",outFields='OBJECTID,Unit_Nm,State_Nm,Mang_Name,Des_Tp,Loc_Nm,GIS_Acres',returnGeometry='false',returnCentroid='true',outSR=4326,resultRecordCount=2000,resultOffset=0,orderByFields='OBJECTID')
rows=[]
while True:
 data=get(base+'?'+urllib.parse.urlencode(params));assert 'features' in data,data
 rows+=data['features']
 if not data.get('exceededTransferLimit'):break
 params['resultOffset']+=2000
save('npt-state-official.json',rows);print('state park parcels',len(rows))
for filename,url in [('npt-banff.html','https://parks.canada.ca/pn-np/ab/banff/activ/camping'),('npt-banff-attractions.html','https://parks.canada.ca/pn-np/ab/banff/visit/les10-top10')]:
 with urllib.request.urlopen(url,timeout=60) as r:(ROOT/filename).write_bytes(r.read())
