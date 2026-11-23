/* Admin-only catalog CRUD for parks, campgrounds, campsites, attractions, and sources. */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const defs={
 national:{title:"National Parks",table:"npt_parks",pk:"id",search:"name",filter:q=>q.in("designation",["national_park","national_park_canada"]),cols:[["name","Park"],["region","Region"],["country","Country"],["official_url","Official link"]],fields:[
  ["name","Name","text",true],["designation","Designation","select",true,["national_park","national_park_canada","other"]],["region","State / region","text"],["country","Country","text",true],["latitude","Latitude","number"],["longitude","Longitude","number"],["official_url","Official URL","url"],["official_id","Agency ID","text"],["description","Description","textarea"],["source_key","Source key","text"],["source_record_id","Source record ID","text"],["metadata","Other metadata (JSON)","json",false,{}]
 ]},
 state:{title:"State Parks",table:"npt_parks",pk:"id",search:"name",filter:q=>q.eq("designation","state_park"),cols:[["name","Park"],["region","State"],["official_url","Official link"]],fields:[
  ["name","Name","text",true],["designation","Designation","select",true,["state_park","other"]],["region","State / region","text"],["country","Country","text",true],["latitude","Latitude","number"],["longitude","Longitude","number"],["official_url","Official URL","url"],["official_id","Agency ID","text"],["description","Description","textarea"],["source_key","Source key","text"],["source_record_id","Source record ID","text"],["metadata","Other metadata (JSON)","json",false,{}]
 ]},
 units:{title:"Other Park Units",table:"npt_parks",pk:"id",search:"name",filter:q=>q.eq("designation","other"),cols:[["name","Park unit"],["region","Region"],["country","Country"]],fields:[
  ["name","Name","text",true],["designation","Designation","select",true,["other","national_park","state_park","national_park_canada"]],["region","State / region","text"],["country","Country","text",true],["latitude","Latitude","number"],["longitude","Longitude","number"],["official_url","Official URL","url"],["official_id","Agency ID","text"],["description","Description","textarea"],["source_key","Source key","text"],["source_record_id","Source record ID","text"],["metadata","Other metadata (JSON)","json",false,{}]
 ]},
 campgrounds:{title:"Campgrounds",table:"npt_campgrounds",pk:"id",search:"name",cols:[["name","Campground"],["operator","Operator"],["region","State"],["max_rv_length_ft","Max RV (ft)"],["electric_hookups","Electric"],["water_hookups","Water"],["sewer_hookups","Sewer"]],fields:[
  ["name","Name","text",true],["park_id","Park","relation",false,"npt_parks"],["country","Country","text",true],["region","State / region","text"],["latitude","Latitude","number"],["longitude","Longitude","number"],["description","Description","textarea"],["official_url","Official URL","url"],["reservation_url","Reservation URL","url"],["operator","Operator / brand","text"],["campground_type","Campground type","text"],["rv_allowed","RVs allowed","boolean"],["trailer_allowed","Trailers allowed","boolean"],["max_rv_length_ft","Maximum RV length (ft)","number"],["max_trailer_length_ft","Maximum trailer length (ft)","number"],["electric_hookups","Electric hookup","boolean"],["water_hookups","Water hookup","boolean"],["sewer_hookups","Sewer hookup","boolean"],["amenities","Amenities (JSON)","json",false,{}],["fees","Campground price range / average (JSON)","json",false,[]],["operating_hours","Operating hours (JSON)","json",false,[]],["reservation_notes","Reservation notes","textarea"],["accessibility","Accessibility (JSON)","json",false,{}],["source_key","Source key","text",true],["source_record_id","Source record ID","text"],["metadata","Other metadata (JSON)","json",false,{}]
 ]},
 campsites:{title:"Individual Campsites",table:"npt_campsites",pk:"id",search:"site_number",cols:[["site_number","Site"],["site_type","Type"],["max_equipment_length_ft","Max rig (ft)"],["electric_amps","Electric amps"],["water_hookup","Water"],["sewer_hookup","Sewer"]],fields:[
  ["campground_id","Campground","relation",true,"npt_campgrounds"],["site_number","Site number","text",true],["site_type","Site type","text"],["max_equipment_length_ft","Maximum equipment length (ft)","number"],["equipment_types","Allowed equipment (comma separated)","array_text"],["electric_amps","Electric amps (comma separated)","array_number"],["water_hookup","Water hookup","boolean"],["sewer_hookup","Sewer hookup","boolean"],["accessible","Accessible site","boolean"],["reservation_url","Reservation URL","url"],["source_key","Source key","text",true],["source_record_id","Source record ID","text",true],["metadata","Other metadata (JSON)","json",false,{}]
 ]},
 attractions:{title:"Attractions",table:"npt_attractions",pk:"id",search:"name",cols:[["name","Attraction"],["attraction_type","Type"],["difficulty","Difficulty"],["duration_minutes","Minutes"]],fields:[
  ["park_id","Park","relation",true,"npt_parks"],["name","Name","text",true],["description","Description","textarea"],["attraction_type","Type","text"],["latitude","Latitude","number"],["longitude","Longitude","number"],["official_url","Official URL","url"],["duration_minutes","Typical duration (minutes)","number"],["difficulty","Difficulty","text"],["accessibility","Accessibility (JSON)","json",false,{}],["seasonality","Seasonality (JSON)","json",false,{}],["source_key","Source key","text",true],["source_record_id","Source record ID","text",true],["metadata","Other metadata (JSON)","json",false,{}]
 ]},
 sources:{title:"Source Directories",table:"npt_catalog_sources",pk:"key",search:"name",cols:[["name","Source"],["key","Key"],["url","Directory URL"],["coverage_notes","Coverage"]],fields:[
  ["key","Source key","text",true],["name","Name","text",true],["url","Official directory URL","url",true],["license_notes","Attribution / usage notes","textarea"],["coverage_notes","Coverage notes","textarea"]
 ]}
};
// Field presence is separate from verification. Never infer sewer from a dump station.
const present=v=>v!==null&&v!==undefined&&v!==""&&(!Array.isArray(v)||v.length>0)&&(typeof v!=="object"||Array.isArray(v)||Object.keys(v).length>0);
const get=(r,k)=>k.split(".").reduce((v,p)=>v==null?undefined:v[p],r);
const parkTab=()=>["national","state","units"].includes(active);
const campTab=()=>["campgrounds","campsites"].includes(active);
const extraFields={
 "metadata.electric_amps":["metadata.electric_amps","Electric amps (comma separated)","array_number"],
 "metadata.dump_station":["metadata.dump_station","Shared dump station available","boolean"],
 "metadata.max_trailer_length_ft":["metadata.max_trailer_length_ft","Published maximum trailer length (ft)","number"],
 "metadata.rate_notes":["metadata.rate_notes","Published rate / range (include currency and period)","textarea"],
 "metadata.detail_source_url":["metadata.detail_source_url","Source URL for this edit","url"]
};
function amps(r){return active==="campsites"?r.electric_amps:(r.metadata?.electric_amps??r.metadata?.electric_amps_observed)}
function electric(r){if(active!=="campsites")return r.electric_hookups;return Array.isArray(amps(r))&&amps(r).some(n=>Number(n)>0)?true:null}
function ratePresent(r){return [r.fees,r.metadata?.rate_notes,r.metadata?.published_nightly_rate_observation,r.metadata?.published_rate_observation,r.metadata?.campground_price_range,r.metadata?.campground_price_summary].some(present)}
function missing(r){
 const gaps=[];const need=(k,label,ok=present(get(r,k)))=>{if(!ok)gaps.push([k,label])};
 if(parkTab()){need("description","Summary");need("official_url","Official link");need("region","State / region");}
 else if(campTab()){
  const site=active==="campsites";
  need(site?"site_type":"campground_type","Type");
  if(!site)need("electric_hookups","Electric",typeof electric(r)==="boolean");
  need(site?"water_hookup":"water_hookups","Water hookup",typeof get(r,site?"water_hookup":"water_hookups")==="boolean");
  need(site?"sewer_hookup":"sewer_hookups","Sewer hookup",typeof get(r,site?"sewer_hookup":"sewer_hookups")==="boolean");
  if(!site)need("metadata.dump_station","Dump station",typeof r.metadata?.dump_station==="boolean");
  if(electric(r)!==false)need(site?"electric_amps":"metadata.electric_amps","Amps",present(amps(r)));
  if(r.trailer_allowed!==false)need(site?"metadata.max_trailer_length_ft":"max_trailer_length_ft","Max trailer",Number(get(r,site?"metadata.max_trailer_length_ft":"max_trailer_length_ft"))>0);
  need("metadata.rate_notes","Rate",ratePresent(r));need("reservation_url","Booking link");
 }else if(active==="attractions"){need("description","Summary");need("official_url","Official link");need("duration_minutes","Duration");}
 else {need("url","Source link");need("coverage_notes","Coverage notes");}
 return gaps;
}
function hookups(r){
 if(parkTab())return "See campground details";
 const site=active==="campsites",e=electric(r),w=r[site?"water_hookup":"water_hookups"],s=r[site?"sewer_hookup":"sewer_hookups"],d=r.metadata?.dump_station;
 const flag=(v,k)=>k+": "+(v===true?"Yes":v===false?"No":"Unknown");
 return (e===true&&w===true&&s===true?"Full: E/W/S · ":"")+[flag(e,"E"),flag(w,"W"),flag(s,"S"),...(!site?[flag(d,"D")]:[])].join(" · ");
}
function trailer(r){
 if(parkTab())return "See campground details";
 if(r.trailer_allowed===false)return "Trailers not allowed";
 const v=active==="campsites"?r.metadata?.max_trailer_length_ft:r.max_trailer_length_ft;
 if(Number(v)>0)return v+" ft";
 return "Unknown"+(active==="campsites"&&Number(r.max_equipment_length_ft)>0?" (equipment limit: "+r.max_equipment_length_ft+" ft)":"");
}
function fieldDef(k){return extraFields[k]||defs[active].fields.find(f=>f[0]===k)}
function gapHTML(r,i){const gaps=missing(r);return gaps.length?gaps.map(([k,label])=>'<button class="npt-cat-gap" data-edit="'+i+'" data-focus="'+k+'">'+esc(label)+'</button>').join(" "):'<span class="npt-cat-complete">Displayed fields populated</span>'}
function summaryCell(r,k,i){
 if(k==="summary_name")return '<button class="npt-cat-name" data-edit="'+i+'">'+esc(r.name||r.site_number||"Unnamed")+'</button><small class="npt-cat-sub">'+esc([r.region,active==="campgrounds"?(r.campground_type||"Type unknown").replace(/_/g," "):active==="campsites"?r.site_type:null].filter(Boolean).join(" · "))+'</small>';
 if(k==="summary_hookups")return parkTab()?esc(hookups(r)):'<button class="npt-cat-cell-edit" data-edit="'+i+'" data-focus="hookups">'+esc(hookups(r))+'</button>';
 if(k==="summary_trailer")return parkTab()?esc(trailer(r)):'<button class="npt-cat-cell-edit" data-edit="'+i+'" data-focus="'+(active==="campsites"?'metadata.max_trailer_length_ft':'max_trailer_length_ft')+'">'+esc(trailer(r))+'</button>';
 if(k==="missing")return gapHTML(r,i);
 return esc(cell(r,k));
}
for(const k of ["national","state","units","campgrounds","campsites"])defs[k].cols=[["summary_name",k==="campsites"?"Site / Type":"Name / Type"],["summary_hookups","Hookups"],["summary_trailer","Max trailer"],["missing","Missing info"]];
for(const k of ["attractions","sources"])defs[k].cols.push(["missing","Missing info"]);
let editFields=[],editRow=null,quickEdit=false,loadId=0;
let active="national",page=0,search="",rows=[],count=0,cache={},overlay,formOverlay;
function db(){return window.nptCloud&&window.nptCloud.db}
function el(){if($("#nptCatalogManager"))return;document.body.insertAdjacentHTML("beforeend",
 '<div class="npt-cat-backdrop" id="nptCatalogManager" hidden><section class="npt-cat-panel" role="dialog" aria-modal="true" aria-label="Catalog Manager"><header class="npt-cat-head"><div><small>ADMIN</small><h2>Catalog Manager</h2><p>Manage source-backed parks, campgrounds, campsites, and attractions.</p></div><button class="npt-cat-close" id="nptCatClose">Close</button></header><div class="npt-cat-toolbar"><input id="nptCatSearch" type="search" placeholder="Search this list"><button class="btn" id="nptCatSearchBtn">Search</button><button class="btn primary" id="nptCatAdd">+ Add record</button></div><nav class="npt-cat-tabs" id="nptCatTabs"></nav><div id="nptCatStatus" class="npt-cat-status" aria-live="polite"></div><div id="nptCatList"></div><footer class="npt-cat-paging"><button class="btn" id="nptCatPrev">← Previous</button><span id="nptCatPage"></span><button class="btn" id="nptCatNext">Next →</button></footer></section></div><div class="npt-cat-form-backdrop" id="nptCatFormBackdrop" hidden><section class="npt-cat-form" role="dialog" aria-modal="true" aria-label="Edit catalog record"><header><h3 id="nptCatFormTitle">Catalog record</h3><button class="npt-cat-close" id="nptCatFormClose">Close</button></header><form id="nptCatForm"><div id="nptCatFields" class="npt-cat-fields"></div><p class="npt-cat-status" id="nptCatFormStatus"></p><div class="npt-cat-form-actions"><button type="button" class="btn danger" id="nptCatDelete" hidden>Delete</button><button type="button" class="btn" id="nptCatCancel">Cancel</button><button type="submit" class="btn primary" id="nptCatSave">Save record</button></div></form></section></div>');
 overlay=$("#nptCatalogManager");formOverlay=$("#nptCatFormBackdrop");
 $("#nptCatClose").onclick=close;$("#nptCatFormClose").onclick=closeForm;$("#nptCatCancel").onclick=closeForm;
 overlay.addEventListener("click",e=>{if(e.target===overlay)close()});
 $("#nptCatSearchBtn").onclick=()=>{search=$("#nptCatSearch").value.trim();page=0;load()};
 $("#nptCatSearch").addEventListener("keydown",e=>{if(e.key==="Enter"){search=e.target.value.trim();page=0;load()}});
 $("#nptCatAdd").onclick=()=>edit(null);
 $("#nptCatPrev").onclick=()=>{if(page){page--;load()}};
 $("#nptCatNext").onclick=()=>{if((page+1)*100<count){page++;load()}};
 $("#nptCatForm").onsubmit=save;
 $("#nptCatDelete").onclick=remove;
 renderTabs();
}
function renderTabs(){const nav=$("#nptCatTabs");nav.innerHTML=Object.keys(defs).map(k=>'<button class="npt-cat-tab'+(k===active?' active':'')+'" data-cat="'+k+'">'+esc(defs[k].title)+'</button>').join("");nav.querySelectorAll("[data-cat]").forEach(b=>b.onclick=()=>{active=b.dataset.cat;page=0;search="";$("#nptCatSearch").value="";renderTabs();load()})}
function status(s){$("#nptCatStatus").textContent=s||""}
async function load(){
 const request=++loadId,d=db(),cfg=defs[active];if(!d)return;
 status("Loading "+cfg.title.toLowerCase()+"…");
 let q=d.from(cfg.table).select("*",{count:"exact"}).order(cfg.search,{ascending:true}).range(page*100,page*100+99);
 if(cfg.filter)q=cfg.filter(q);
 if(search)q=q.ilike(cfg.search,"%"+search.replace(/[%_]/g,"")+"%");
 const r=await q;
 if(request!==loadId)return;
 if(r.error){status(r.error.message);$("#nptCatList").innerHTML="";return}
 rows=r.data||[];count=r.count||0;
 const pageIds=rows.map(x=>x[cfg.pk]).filter(Boolean);
 const table='<div class="npt-cat-table-wrap"><table class="npt-cat-table"><thead><tr>'+cfg.cols.map(c=>'<th>'+esc(c[1])+'</th>').join("")+'<th>Actions</th></tr></thead><tbody>'+rows.map((row,i)=>'<tr>'+cfg.cols.map(c=>'<td>'+summaryCell(row,c[0],i)+'</td>').join("")+'<td><button class="btn" data-edit="'+i+'">Edit</button></td></tr>').join("")+'</tbody></table></div>';
 $("#nptCatList").innerHTML=count?table:'<div class="npt-cat-empty">No records found.</div>';
 $("#nptCatList").querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>edit(rows[Number(b.dataset.edit)],b.dataset.focus));
 $("#nptCatPage").textContent=count?((page*100+1)+"–"+Math.min((page+1)*100,count)+" of "+count):"0 records";
 $("#nptCatPrev").disabled=page===0;$("#nptCatNext").disabled=(page+1)*100>=count;
 status("Showing "+cfg.title.toLowerCase()+". Click a missing field to fill it in. Populated does not mean verified. E = electric, W = water, S = sewer at site; D = shared dump station. Full requires E/W/S. Park limits vary by campground.");
}
function cell(row,key){let v=row[key];if(key==="park_id"||key==="campground_id"){return v?((cache[key]||{})[v]||v):""}if(Array.isArray(v))return v.join(", ");if(v&&typeof v==="object")return JSON.stringify(v);if(typeof v==="boolean")return v?"Yes":"No";return v==null?"":v}
async function relations(table){if(cache["table:"+table])return cache["table:"+table];let all=[],start=0;while(true){const r=await db().from(table).select(table==="npt_parks"?"id,name,region":"id,name,region").order("name").range(start,start+499);if(r.error)throw r.error;all=all.concat(r.data||[]);if(!r.data||r.data.length<500)break;start+=500}const opts=all.map(x=>({value:x.id,label:[x.name,x.region].filter(Boolean).join(" · ")}));cache["table:"+table]=opts;const map={};opts.forEach(x=>map[x.value]=x.label);const fk=table==="npt_parks"?"park_id":"campground_id";cache[fk]=map;return opts}
function inputHTML(f,v){
 const key=f[0],label=f[1],type=f[2],required=f[3],extra=f[4];let value=v;
 if(value==null)value="";
 if(type==="boolean")return '<label class="npt-cat-field"><span>'+esc(label)+'</span><select id="catf-'+key+'"><option value="">Unknown</option><option value="true" '+(value===true?'selected':'')+'>Yes</option><option value="false" '+(value===false?'selected':'')+'>No</option></select></label>';
 if(type==="select")return '<label class="npt-cat-field"><span>'+esc(label)+'</span><select id="catf-'+key+'" '+(required?'required':'')+'>'+extra.map(o=>'<option value="'+esc(o)+'" '+(value===o?'selected':'')+'>'+esc(o.replace(/_/g," "))+'</option>').join("")+'</select></label>';
 if(type==="relation")return '<label class="npt-cat-field"><span>'+esc(label)+'</span><select id="catf-'+key+'" '+(required?'required':'')+'><option value="">Select…</option></select><small>Type to filter by name if the list is long.</small></label>';
 if(type==="json")value=JSON.stringify(value===""?(extra||{}):value,null,2);
 if(type==="array_text"||type==="array_number")value=Array.isArray(value)?value.join(", "):value;
 const tag=type==="textarea"||type==="json"?"textarea":"input",kind=type==="number"?"number":type==="url"?"url":"text";
 return '<label class="npt-cat-field"><span>'+esc(label)+'</span>'+(tag==="textarea"?'<textarea id="catf-'+key+'" '+(required?'required':'')+'>'+esc(value)+'</textarea>':'<input id="catf-'+key+'" type="'+kind+'" value="'+esc(value)+'" '+(required?'required':'')+' '+(type==="number"?'step="any"':'')+'>')+'</label>';
}
async function edit(row,focus){
 quickEdit=Boolean(row&&focus);editRow=row;
 const keys=focus==="hookups"?(active==="campsites"?["electric_amps","water_hookup","sewer_hookup"]:["electric_hookups","water_hookups","sewer_hookups","metadata.dump_station","metadata.electric_amps"]):[focus];
 editFields=quickEdit?keys.map(fieldDef).filter(Boolean):defs[active].fields;
 if(quickEdit)editFields=[...editFields,extraFields["metadata.detail_source_url"]];
 const cfg=defs[active];$("#nptCatFormTitle").textContent=(row?"Edit ":"Add ")+cfg.title.replace(/s$/,"");
 $("#nptCatFields").innerHTML=editFields.map(f=>inputHTML(f,row?get(row,f[0]):defaultValue(f))).join("");
 for(const f of editFields)if(f[2]==="relation"){try{const options=await relations(f[4]);const sel=$("#catf-"+f[0]);sel.innerHTML='<option value="">Select…</option>'+options.map(o=>'<option value="'+esc(o.value)+'">'+esc(o.label)+'</option>').join("");if(row&&row[f[0]])sel.value=row[f[0]];}catch(e){$("#nptCatFormStatus").textContent="Could not load linked records: "+e.message}}
 $("#nptCatDelete").hidden=!row||quickEdit;$("#nptCatFormStatus").textContent="";
 formOverlay.dataset.pk=row?row[cfg.pk]:"";formOverlay.dataset.isNew=row?"false":"true";formOverlay.hidden=false;
 if(quickEdit){$("#nptCatFormTitle").textContent=(row.name||row.site_number)+" — "+(focus==="hookups"?"Hookups":fieldDef(focus)?.[1]||"Edit");document.getElementById("catf-"+editFields[0][0])?.focus();}
}
function defaultValue(f){if(f[0]==="source_key")return"manual_admin";if(f[0]==="country")return"US";if(f[2]==="json")return f[4]||{};if(f[2]==="boolean")return null;return""}
function parseField(f){
 const key=f[0],type=f[2],raw=document.getElementById("catf-"+key).value.trim();
 if(type==="boolean")return raw===""?null:raw==="true";
 if(type==="number"){if(raw==="")return null;const n=Number(raw);if(!Number.isFinite(n)||(key.includes("length")&&n<=0))throw Error(f[1]+" must be a positive number.");return n;}
 if(type==="json"){if(!raw)return f[4]||{};return JSON.parse(raw)}
 if(type==="array_text")return raw?raw.split(",").map(x=>x.trim()).filter(Boolean):[];
 if(type==="array_number"){if(!raw)return [];const values=raw.split(",").map(x=>Number(x.trim()));if(values.some(n=>!Number.isInteger(n)||n<=0))throw Error(f[1]+" must contain positive whole numbers.");return [...new Set(values)];}
 return raw||null;
}
async function save(e){
 e.preventDefault();const cfg=defs[active],d=db(),isNew=formOverlay.dataset.isNew==="true";const out={};let latestRow=null;
 try{
  for(const f of editFields){const value=parseField(f);if(f[3]&&(value===null||value===""))throw Error(f[1]+" is required.");
   if(f[0].startsWith("metadata.")){out.metadata=out.metadata||{...(editRow?.metadata||{})};out.metadata[f[0].slice(9)]=value;}else out[f[0]]=value;
  }
  if(quickEdit){
   const latest=await d.from(cfg.table).select("*").eq(cfg.pk,formOverlay.dataset.pk).single();if(latest.error)throw latest.error;latestRow=latest.data;
   for(const f of editFields)if(JSON.stringify(get(latest.data,f[0]))!==JSON.stringify(get(editRow,f[0])))throw Error("This field changed since you opened it. Close and reopen the editor to see the latest value.");
   if(out.metadata){const edits=Object.fromEntries(editFields.filter(f=>f[0].startsWith("metadata.")).map(f=>[f[0].slice(9),out.metadata[f[0].slice(9)]]));out.metadata={...(latest.data.metadata||{}),...edits};}
  }
  if((cfg.table==="npt_campgrounds"||cfg.table==="npt_campsites"||cfg.table==="npt_attractions")&&!out.source_record_id&&isNew)out.source_record_id="admin-"+crypto.randomUUID();
  $("#nptCatSave").disabled=true;$("#nptCatFormStatus").textContent="Saving…";
  let q=isNew?d.from(cfg.table).insert(out):d.from(cfg.table).update(out).eq(cfg.pk,formOverlay.dataset.pk);
  if(quickEdit&&latestRow){for(const key of Object.keys(out)){const value=latestRow[key];q=value==null?q.is(key,null):q.eq(key,typeof value==="object"?JSON.stringify(value):value);}}
  const r=await q.select(cfg.pk);if(r.error)throw r.error;if(!r.data?.length)throw Error("No record was saved. The record may have changed or your administrator access may have expired. Reopen it and try again.");
  closeForm();cache={};await load();
 }catch(err){$("#nptCatFormStatus").textContent=err.message||String(err)}
 finally{$("#nptCatSave").disabled=false}
}
async function remove(){
 const cfg=defs[active],row=rows.find(x=>String(x[cfg.pk])===String(formOverlay.dataset.pk));if(!row)return;
 if(!confirm("Delete this catalog record? Linked campground, campsite, or attraction records may prevent deletion."))return;
 const r=await db().from(cfg.table).delete().eq(cfg.pk,row[cfg.pk]);if(r.error){$("#nptCatFormStatus").textContent=r.error.message;return}
 closeForm();cache={};await load();
}
function close(){overlay.hidden=true;closeForm();document.body.classList.remove("npt-cat-open")}
function closeForm(){if(formOverlay)formOverlay.hidden=true}
window.openNptCatalogManager=async function(){el();if(!window.nptCloud||!window.nptCloud.isCatalogAdmin()){alert("Catalog Manager is available to an authorized administrator.");return}overlay.hidden=false;document.body.classList.add("npt-cat-open");await load()};
document.addEventListener("npt-catalog-access",e=>{const b=$("#nptCatalogButton");if(b)b.hidden=!Boolean(e.detail&&e.detail.admin)});
})();
