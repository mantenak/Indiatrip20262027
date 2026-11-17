(() => {
  "use strict";
  function el(tag,text,attrs={}){
    const node=document.createElement(tag);
    if(text!==undefined) node.textContent=text;
    for(const [key,value] of Object.entries(attrs)) node.setAttribute(key,value);
    return node;
  }
  function button(label,action){
    const node=el("button",label,{class:"btn",type:"button"});
    node.addEventListener("click",action);
    return node;
  }
  function mapSearch(name,location=""){
    return "https://www.google.com/maps/search/?api=1&query="+encodeURIComponent([name,location].filter(Boolean).join(" "));
  }
  function mapsLink(label,name,location){
    return el("a",label,{href:mapSearch(name,location),target:"_blank",rel:"noopener noreferrer"});
  }
  function formatDate(start,index){
    if(!start) return "";
    const date=new Date(start+"T12:00:00Z");
    if(Number.isNaN(+date)) return "";
    date.setUTCDate(date.getUTCDate()+index-1);
    return date.toLocaleDateString(undefined,{month:"short",day:"numeric",timeZone:"UTC"});
  }
  function getStays(trip){
    const stays=[];
    trip.days.forEach((day,index)=>{
      if(!day.campground?.trim()) return;
      const last=stays.at(-1);
      if(last?.name===day.campground && last.last===index-1 && last.segment===day.segmentNumber){
        last.last=index;
        return;
      }
      stays.push({name:day.campground,first:index,last:index,segment:day.segmentNumber,day});
    });
    return stays;
  }
  function dataRow(dl,label,value){
    if(value===null||value===undefined||value==="") return;
    const pair=el("div");
    pair.append(el("dt",label),el("dd",String(value)));
    dl.append(pair);
  }
  function bookingLink(details){
    if(details.bookingURL){
      try {
        const url=new URL(details.bookingURL);
        if(url.protocol==="https:") return url.href;
      } catch {}
    }
    const notes=details.reservationNotes||"";
    if(/Parks Canada/i.test(notes)) return "https://reservation.pc.gc.ca/";
    if(/California State Parks/i.test(notes)) return "https://www.reservecalifornia.com/";
    if(/\bNPS\b/i.test(notes)) return "https://www.recreation.gov/search?q="+encodeURIComponent(details.name);
    return null;
  }
  function replaceEditor(trip,stay,card){
    const form=el("form",undefined,{class:"npt-replace"});
    const search=el("input",undefined,{type:"search","aria-label":"Search campgrounds",placeholder:"Search by name, park, or location"});
    const results=el("select",undefined,{"aria-label":"Matching campgrounds"});
    const name=el("input",undefined,{"aria-label":"Replacement campground",placeholder:"Replacement campground name",required:""});
    const location=el("input",undefined,{"aria-label":"Replacement location",placeholder:"Location"});
    const hookups=el("input",undefined,{"aria-label":"Replacement hookups",placeholder:"Hookups"});
    const status=el("p","",{role:"status"});
    const submit=el("button","Save replacement",{class:"btn primary",type:"submit"});
    const candidates=trip.campgrounds.filter(c=>c.name!==stay.name);
    let picked=null;
    function resultsForSearch(){
      const q=search.value.trim().toLowerCase();
      results.replaceChildren(el("option",q?"Select a saved match":"Select a saved campground",{value:""}));
      candidates.forEach((c,i)=>{
        if(![c.name,c.park,c.location].join(" ").toLowerCase().includes(q)) return;
        results.append(el("option",[c.name,c.location].filter(Boolean).join(" · "),{value:String(i)}));
      });
    }
    search.oninput=resultsForSearch;
    results.onchange=()=>{
      picked=results.value===""?null:candidates[Number(results.value)];
      if(!picked) return;
      name.value=picked.name;location.value=picked.location||"";hookups.value=picked.hookups||"";
    };
    resultsForSearch();
    const nearby=mapsLink("Search nearby campgrounds on Google Maps","Campgrounds near",stay.day.location||stay.day.park);
    form.append(search,results,nearby,name,location,hookups,submit,status);
    form.onsubmit=async event=>{
      event.preventDefault();
      if(!name.value.trim()) return;
      const candidate=picked?.name===name.value.trim()?picked:{};
      const {arrivalDate,departureDate,siteNumber,confirmationNumber,bookingMode,...catalog}=candidate;
      const replacement={...catalog,name:name.value.trim(),location:location.value.trim(),hookups:hookups.value.trim(),
        park:candidate.park||stay.day.park,reserved:false,availabilityStatus:"Unverified"};
      const itinerary=trip.days.map((day,i)=>{
        if(i===stay.last+1&&day.driveFrom) return {...day,driveFrom:replacement.name,driveMiles:null,driveMinutes:null};
        if(i<stay.first||i>stay.last) return day;
        return {...day,campground:replacement.name,hookups:replacement.hookups,
          location:replacement.location||day.location,nightsSinceFullHookup:null,
          ...(i===stay.first&&day.driveTo?{driveTo:replacement.name,driveMiles:null,driveMinutes:null}:{})};
      });
      const segmentIndex=trip.segments.findIndex(segment=>String(segment.sequence)===String(stay.segment)&&segment.campground===stay.name);
      const routeSegments=trip.segments.map((segment,i)=>{
        if(segmentIndex<0) return segment;
        if(i===segmentIndex+1) return {...segment,driveFrom:replacement.name,driveMiles:null,driveMinutes:null};
        if(i!==segmentIndex) return segment;
        return {...segment,campground:replacement.name,hookups:replacement.hookups,location:replacement.location||segment.location,
          mapPoint:null,driveTo:replacement.name,driveMiles:null,driveMinutes:null};
      });
      const campgrounds=[...trip.campgrounds.filter(c=>c.name!==replacement.name||c.location!==replacement.location),replacement];
      submit.disabled=true;
      try {
        await window.saveNptStay(trip,{itinerary,route_segments:routeSegments,campgrounds});
        renderDetails();
        const feedback=el("p","Campground replacement saved. Review the affected driving legs and booking details.",{role:"status"});
        document.getElementById("detailsList").prepend(feedback);
      } catch(error) {status.textContent=error.message;}
      finally {submit.disabled=false;}
    };
    card.append(form);
    search.focus();
  }
  window.renderNptStays=(box,trip,mode)=>{
    const stays=getStays(trip);
    if(!stays.length){box.append(el("p","No overnight stays are planned yet."));return;}
    if(mode==="reservations") box.append(el("p","Planned stays and reservation information saved with this trip. Unknown dates and bookings are marked below."));
    stays.forEach(stay=>{
      const card=el("article",undefined,{class:"dayitem npt-stay"});
      const top=el("div",undefined,{class:"npt-stay-head"});
      const label=el("div");
      const from=stay.day.dayNumber||stay.first+1;
      const to=trip.days[stay.last].dayNumber||stay.last+1;
      const nights=stay.last-stay.first+1;
      label.append(el("h4",stay.name),el("p",`Day${from===to?" "+from:"s "+from+"–"+to} · ${nights} night${nights===1?"":"s"}`));
      top.append(label);
      if(mode==="campgrounds"&&window.nptCanEdit?.()){
        const edit=button("Find a replacement",()=>{
          const existing=card.querySelector("form");
          if(existing){existing.remove();edit.setAttribute("aria-expanded","false");return;}
          replaceEditor(trip,stay,card);edit.setAttribute("aria-expanded","true");
        });
        edit.setAttribute("aria-expanded","false");
        top.append(edit);
      }
      card.append(top);
      const details=trip.campgrounds.find(c=>c.name===stay.name&&c.location===stay.day.location)||
        trip.campgrounds.find(c=>c.name===stay.name)||{};
      const fields=el("dl",undefined,{class:"npt-stay-fields"});
      dataRow(fields,"Park",stay.day.park);
      dataRow(fields,"Location",details.location||stay.day.location);
      dataRow(fields,"Hookups",stay.day.hookups||details.hookups);
      dataRow(fields,"RV length limit",details.maxRVFeet?details.maxRVFeet+" ft":null);
      if(mode==="reservations"){
        dataRow(fields,"Arrival",details.arrivalDate||formatDate(trip.startDate,from)||"Date not set");
        dataRow(fields,"Departure",details.departureDate||formatDate(trip.startDate,to+1)||"Date not set");
        dataRow(fields,"Status",details.reserved?"Reserved":"Planned · booking not confirmed");
        dataRow(fields,"Booking provider",details.provider);
        dataRow(fields,"Availability",details.availabilityStatus);
        dataRow(fields,"Booking window",details.bookingWindow);
        dataRow(fields,"Site",details.siteNumber);
        dataRow(fields,"Booking mode",details.bookingMode);
      }
      card.append(fields);
      if(mode==="reservations"){
        if(details.reservationNotes) card.append(el("p",details.reservationNotes));
        const url=bookingLink(details);
        if(url) card.append(el("a","Open booking website",{href:url,target:"_blank",rel:"noopener noreferrer"}));
      } else if(details.securityIncidentStatus){
        card.append(el("p","Security incident records: "+details.securityIncidentStatus));
      }
      box.append(card);
    });
  };
  let active=null, leafletPromise;
  function leaflet(){
    if(window.L) return Promise.resolve(window.L);
    if(!leafletPromise){
      const css=el("link",undefined,{rel:"stylesheet",href:"https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css"});
      document.head.append(css);
      leafletPromise=new Promise((resolve,reject)=>{
        const script=el("script",undefined,{src:"https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"});
        script.onload=()=>window.L?resolve(window.L):reject(new Error("Map library unavailable."));
        script.onerror=()=>{leafletPromise=null;reject(new Error("Map library unavailable."));};
        document.head.append(script);
      });
    }
    return leafletPromise;
  }
  function point(value){
    if(!Array.isArray(value)||value.length!==2||!value.every(Number.isFinite)) return null;
    return Math.abs(value[0])<=90&&Math.abs(value[1])<=180?value:null;
  }
  function drawWalk(state){
    const {trip,map,L,route,dayIndex,panel,key}=state;
    state.layers?.remove();
    state.activity?.remove();
    state.activity=null;
    state.layers=L.layerGroup().addTo(map);
    const full=dayIndex===null;
    const day=trip.days[dayIndex];
    const segmentIndex=full?-1:day.segmentNumber==null?route.length-1:trip.segments.findIndex(s=>s.sequence===day.segmentNumber)+1;
    const segment=trip.segments[segmentIndex-1];
    const previous=route[segmentIndex-1];
    const destination=route[segmentIndex];
    const hasDrive=!full&&Boolean(day.driveFrom&&day.driveTo);
    for(let i=1;i<route.length;i++){
      if(!route[i-1]||!route[i]) continue;
      const road=state.roads?.[i-1];
      const selected=hasDrive&&i===segmentIndex;
      L.polyline(road||[route[i-1],route[i]],{color:selected?"#a64f24":"#285c49",weight:selected?6:3,opacity:full||selected?0.88:0.28,dashArray:road?null:"6 6"}).addTo(state.layers);
    }
    const lastIndex=route.length-1;
    const loop=route[0]&&route[lastIndex]&&route[0].every((value,index)=>value===route[lastIndex][index]);
    route.forEach((coords,i)=>{
      if(!coords||(loop&&i===lastIndex)) return;
      const selected=i===segmentIndex||(loop&&i===0&&segmentIndex===lastIndex);
      const endpoint=i===0||i===lastIndex;
      const label=i===0?(loop?"Start / End":"Start"):i===lastIndex?"End":stopSymbol(trip,i,lastIndex)+" "+i;
      const width=endpoint?(loop&&i===0?82:48):34;
      const marker=L.marker(coords,{icon:L.divIcon({className:"leaflet-div-icon",html:`<span class="npt-map-pin ${selected?"current":""}" style="width:${width}px;border-radius:${endpoint?12:50}${endpoint?"px":"%"}">${label}</span>`,iconSize:[width,25],iconAnchor:[width/2,12]}),
        zIndexOffset:endpoint?300:0,
        title:i===0?trip.startLocation:i===lastIndex?trip.endLocation:trip.segments[i-1].campground||trip.segments[i-1].location});
      marker.addTo(state.layers);
      if(loop&&i===0){
        const popup=el("div");
        popup.append(el("strong",trip.startLocation||"Round trip"),el("br"),
          button("Departure",()=>state.mode==="details"?playPreview(state,0):state.select(0)),
          button("Return",()=>state.mode==="details"?playPreview(state,lastIndex):state.select(trip.days.length-1)));
        marker.bindPopup(popup);
        return;
      }
      if(state.mode==="details"){marker.on("click",()=>playPreview(state,i));return;}
      if(endpoint){marker.on("click",()=>state.select(i===0?0:trip.days.length-1));return;}
      const s=trip.segments[i-1];
      const stayDays=trip.days.map((d,index)=>({d,index})).filter(({d})=>d.segmentNumber===s.sequence);
      const popup=el("div");popup.append(el("strong",s.campground||s.location));
      stayDays.forEach(({d,index})=>popup.append(button("Day "+(d.dayNumber||index+1),()=>state.select(index))));
      marker.bindPopup(popup);
    });
    const bounds=full?route.filter(Boolean):hasDrive&&previous&&destination?(state.roads?.[segmentIndex-1]||[previous,destination]):destination?[destination]:[];
    if(bounds.length) map.fitBounds(bounds,{padding:[28,28],maxZoom:full?9:13});
    key.textContent=state.roads?"Road routing uses a standard driving profile. RV clearance and access are unverified. Dashed lines show approximate connections.":"Dashed lines connect approximate stops. They do not show the roads to drive.";
    panel.replaceChildren();
    if(full){
      panel.append(el("h3","Entire itinerary"),el("p",`${trip.days.length} days · ${trip.segments.length} stops`));
      const dayList=el("div",undefined,{style:"display:grid;gap:6px"});
      getStays(trip).forEach(stay=>{
        const day=button(`Day ${stay.first+1} · ${stay.name}`,()=>state.select(stay.first));
        day.style.textAlign="left";
        dayList.append(day);
      });
      panel.append(dayList);
      return;
    }
    panel.append(el("h3",`Day ${day.dayNumber||dayIndex+1} · ${day.park||day.location||"Travel"}`));
    const date=formatDate(trip.startDate,day.dayNumber||dayIndex+1);
    if(date) panel.append(el("p",date));
    if(hasDrive){
      panel.append(el("p",`${day.driveFrom} → ${day.driveTo}`));
      const metrics=[day.driveMiles!=null?day.driveMiles+" estimated mi":"",day.driveMinutes!=null?Math.floor(day.driveMinutes/60)+" hr "+day.driveMinutes%60+" min estimated":""].filter(Boolean);
      if(metrics.length) panel.append(el("p",metrics.join(" · ")));
    } else panel.append(el("p","No drive between overnight stops is planned for this day."));
    if(day.campground) panel.append(el("p",[day.campground,day.hookups].filter(Boolean).join(" · ")));
    if(day.activities?.length){
      panel.append(el("h4","Activities"));
      const list=el("ul");
      day.activities.forEach(activity=>{
        const name=typeof activity==="string"?activity:activity?.name;
        if(!name) return;
        const item=el("li",name);
        const coords=point(activity.mapPoint);
        if(coords){
          const marker=L.circleMarker(coords,{radius:6,color:"#275f99",fillOpacity:0.9}).addTo(state.layers);
          marker.bindTooltip(el("span",name));
          item.append(" ",button("Show pin",()=>{map.setView(coords,14);marker.openTooltip();}));
        }
        if(activity.trailGeometry){
          item.append(" ",button("Show trail",()=>{
            state.activity?.remove();
            state.activity=L.geoJSON(activity.trailGeometry,{style:{color:"#275f99",weight:4}}).addTo(map);
            if(state.activity.getBounds().isValid()) map.fitBounds(state.activity.getBounds(),{padding:[24,24],maxZoom:15});
          }));
        }
        item.append(el("br"),mapsLink(/trail|hike/i.test(name)?"Find trail on Google Maps":"Find on Google Maps",name,day.park||segment?.location));
        list.append(item);
      });
      panel.append(list);
    }
    if(day.notes) panel.append(el("p",day.notes));
  }
  function previewLeg(points) {
    const distances=[0];
    for(let i=1;i<points.length;i++){
      const [a,b]=points[i-1], [c,d]=points[i];
      distances.push(distances[i-1]+Math.hypot(c-a,(d-b)*Math.cos((a+c)*Math.PI/360)));
    }
    return progress=>{
      const target=progress*distances.at(-1);
      if(target<=0) return points[0];
      const i=distances.findIndex(distance=>distance>=target);
      if(i<1) return points.at(-1);
      const share=(target-distances[i-1])/(distances[i]-distances[i-1]);
      return points[i-1].map((value,k)=>value+(points[i][k]-value)*share);
    };
  }
  function milesBetween(a,b) {
    return 69*Math.hypot(b[0]-a[0],(b[1]-a[1])*Math.cos((a[0]+b[0])*Math.PI/360));
  }
  const landmarkPhotos=new Map();
  function addLandmarkPhoto(state,title) {
    if(state.trip.privacy!=="public"||!state.trip.parks?.includes(title)||!/(National Park|National Monument|National Memorial)/i.test(title)) return;
    const caption=el("figure",undefined,{style:"margin:12px 0"});
    state.panel.append(caption);
    if(!landmarkPhotos.has(title)){
      const query=new URLSearchParams({action:"query",prop:"pageimages",piprop:"thumbnail|name",pithumbsize:"480",titles:title,redirects:"1",format:"json",formatversion:"2",origin:"*"});
      landmarkPhotos.set(title,fetch("https://en.wikipedia.org/w/api.php?"+query)
        .then(response=>response.ok?response.json():null)
        .then(result=>result?.query?.pages?.[0]||null).catch(()=>null));
    }
    landmarkPhotos.get(title).then(page=>{
      if(!caption.isConnected||!page?.thumbnail?.source||!page.pageimage) return;
      const source=new URL(page.thumbnail.source);
      if(source.protocol!=="https:"||source.hostname!=="upload.wikimedia.org") return;
      const img=el("img",undefined,{src:source.href,alt:title,style:"display:block;width:100%;max-height:210px;object-fit:cover;border-radius:9px"});
      img.onerror=()=>caption.remove();
      const credit=el("a","Photo and credit",{href:"https://commons.wikimedia.org/wiki/File:"+encodeURIComponent(page.pageimage),target:"_blank",rel:"noopener noreferrer"});
      const label=el("figcaption","Landmark photo · ");
      label.append(credit);caption.append(img,label);
    });
  }
  function previewStopTitle(state,stop) {
    if(stop.index===0) return state.trip.startLocation||"Departure";
    if(stop.index===state.route.length-1) return state.trip.endLocation||"Return";
    const segment=state.trip.segments[stop.index-1];
    return segment?.campground||segment?.park||segment?.location||"Stop "+stop.index;
  }
  function stopSymbol(trip,index,lastIndex) {
    if(index===0||index===lastIndex) return "⚑";
    const segment=trip.segments[index-1];
    if(segment?.campground) return "⛺";
    return segment?.park&&!/travel day/i.test(segment.park)?"◆":"•";
  }
  function showPreviewStop(state,tooltip,stop) {
    const label=el("span",stopSymbol(state.trip,stop.index,state.route.length-1)+" "+previewStopTitle(state,stop),
      {style:"display:block;width:max-content;max-width:min(225px, 62vw);white-space:normal;overflow-wrap:break-word;text-align:left"});
    tooltip.setLatLng(stop.point).setContent(label);
    if(!state.map.hasLayer(tooltip)) tooltip.addTo(state.map);
  }
  const officialParkPhotos={
    "Badlands National Park":["badl","mwr","C4524107-A9DF-29E3-80B8554266867C06","Badlands formations"],
    "Glacier National Park":["glac","imr","C5A56E57-BB50-A74E-C7FA6F9F2218D91F","Glacier beneath rocky mountains"],
    "Yosemite National Park":["yose","pwr","36C683FE-1DD8-B71B-0B6B4AE9C34946B8","Granite cliffs and a waterfall in Yosemite"],
    "Grand Canyon National Park":["grca","imr","99556161-1DD8-B71B-0B896E4D786C6B47","Grand Canyon buttes beneath a blue sky"],
    "Yellowstone National Park":["yell","imr","22D0798C-F552-D488-C5047B379DB6005C","Northern lights over Yellowstone’s hydrothermal terraces"]
  };
  function appendStopPhoto(entry,src,alt,description,url,creditLabel){
    if(!entry.card.isConnected) return;
    const photo=el("figure",undefined,{style:"margin:8px 0 0"});
    const image=el("img",undefined,{src,alt,loading:"lazy",style:"display:block;width:100%;max-height:200px;object-fit:cover;border-radius:8px"});
    image.onerror=()=>photo.remove();
    const caption=el("figcaption",description+" · ");
    caption.append(el("a",creditLabel,{href:url,target:"_blank",rel:"noopener noreferrer"}));
    photo.append(image,caption);
    entry.card.append(photo);
    entry.onPhoto?.({src,alt,description,url,creditLabel});
  }
  const detailedPhotos=new Map();
  function loadStopPhotos(state,entries) {
    if(state.trip.privacy!=="public"||!entries.length) return;
    const photoEntries=[];
    for(const entry of entries){
      if(entry.type==="Campground"){
        if(entry.name==="Madison Campground"&&entry.park==="Yellowstone National Park"){
          appendStopPhoto(entry,"https://www.nps.gov/yell/planyourvisit/images/madison_4.jpg","Example campsite at Madison Campground",
            "Example campsite","https://www.nps.gov/yell/planyourvisit/madisoncg.htm","National Park Service / Diane Renkin");
        }
        continue;
      }
      const official=Object.hasOwn(officialParkPhotos,entry.name)?officialParkPhotos[entry.name]:null;
      if(official){
        const [park,region,file,alt]=official;
        appendStopPhoto(entry,`https://www.nps.gov/common/uploads/banner_image/${region}/homepage/${file}.jpg`,alt,
          "Park photo",`https://www.nps.gov/${park}/index.htm`,"National Park Service");
      }else if(!entry.name.includes("|")) photoEntries.push(entry);
    }
    if(!photoEntries.length) return;
    const titles=[...new Set(photoEntries.map(entry=>entry.name))].slice(0,50);
    const key=titles.join("|");
    if(!detailedPhotos.has(key)){
      const query=new URLSearchParams({action:"query",prop:"pageimages",piprop:"thumbnail|name",pithumbsize:"560",pilicense:"free",titles:key,format:"json",formatversion:"2",origin:"*"});
      detailedPhotos.set(key,fetch("https://en.wikipedia.org/w/api.php?"+query)
        .then(response=>response.ok?response.json():null)
        .then(result=>result?.query?.pages||[]).catch(()=>[]));
    }
    detailedPhotos.get(key).then(pages=>{
      for(const entry of photoEntries){
        if(!entry.card.isConnected) continue;
        const page=pages.find(item=>item.title?.toLowerCase()===entry.name.toLowerCase()&&!item.missing);
        const source=page?.thumbnail?.source;
        if(!source?.startsWith("https://upload.wikimedia.org/")||!page.pageimage) continue;
        appendStopPhoto(entry,source,entry.name,entry.type+" photo",
          "https://commons.wikimedia.org/wiki/File:"+encodeURIComponent(page.pageimage),"Photo credit");
      }
    });
  }
  function findDetailedCampground(trip,segment) {
    if(!segment?.campground) return null;
    return trip.campgrounds.find(item=>item.name===segment.campground&&
      (item.park===segment.park||item.location===segment.location))||
      trip.campgrounds.find(item=>item.name===segment.campground)||null;
  }
  const officialStopNotes={
    "Badlands National Park|Cedar Pass Campground":{
      text:"Check-in starts at 1 pm. Check-out is 11 am. No generators during quiet hours (10 pm–6 am).",
      url:"https://www.recreation.gov/camping/campgrounds/10288228",source:"Recreation.gov"
    },
    "Yellowstone National Park|Madison Campground":{
      text:"No electric hookups. About 14 miles east of West Yellowstone and 16 miles north of Old Faithful.",
      url:"https://www.nps.gov/yell/planyourvisit/madisoncg.htm",source:"National Park Service"
    }
  };
  function detailedStopFacts(trip,segment,days,campground){
    const first=days[0]?.dayNumber,last=days.at(-1)?.dayNumber;
    const arrival=first!=null?formatDate(trip.startDate,first):"";
    const departure=last!=null&&segment?.nights?formatDate(trip.startDate,last+1):"";
    const traveling=days.find(day=>day.driveFrom&&day.driveTo);
    const minutes=traveling?.driveMinutes??segment?.driveMinutes;
    const miles=traveling?.driveMiles??segment?.driveMiles;
    const duration=Number.isFinite(minutes)&&minutes>0?[Math.floor(minutes/60)?Math.floor(minutes/60)+" hr":"",minutes%60?minutes%60+" min":""].filter(Boolean).join(" "):"";
    const drive=[Number.isFinite(miles)&&miles>0?miles+" mi":"",duration].filter(Boolean).join(" · ");
    const stay=[arrival?(departure?arrival+"–"+departure:arrival):first!=null?(first===last?"Day "+first:"Days "+first+"–"+last):"",
      segment?.nights?segment.nights+(segment.nights===1?" night":" nights"):""].filter(Boolean).join(" · ");
    return [
      ["Stay",stay],
      ["Drive estimate",drive],
      ["Hookups",segment?.hookups||campground?.hookups],
      ["Listed RV limit",campground?.maxRVFeet?campground.maxRVFeet+" ft · confirm your site":null]
    ];
  }
  function openDetailedMapCard(state,stop,segment,days,campground,attractions) {
    const title=previewStopTitle(state,stop);
    const content=el("section",undefined,{"aria-label":title,style:"width:min(254px, 62vw)"});
    content.append(el("strong",stopSymbol(state.trip,stop.index,state.route.length-1)+" "+title));
    if(segment?.location&&segment.location!==title) content.append(el("p",segment.location,{style:"margin:3px 0"}));
    const facts=el("dl",undefined,{class:"npt-stay-fields",style:"grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:7px 0"});
    detailedStopFacts(state.trip,segment,days,campground).forEach(([label,value])=>dataRow(facts,label,value));
    if(facts.childElementCount) content.append(facts);
    const notes=officialStopNotes[segment?.park+"|"+segment?.campground];
    if(notes){
      const row=el("p",notes.text+" ",{style:"margin:6px 0"});
      row.append(el("a",notes.source,{href:notes.url,target:"_blank",rel:"noopener noreferrer"}));
      content.append(row);
    }
    if(campground?.reservationNotes){
      const booking=el("p","Booking: "+campground.reservationNotes,{style:"margin:6px 0"});
      content.append(booking);
    }
    const url=campground&&bookingLink(campground);
    if(url) content.append(el("a","Booking information",{href:url,target:"_blank",rel:"noopener noreferrer"}));
    if(attractions.length) content.append(el("p","Planned nearby: "+attractions.slice(0,2).join(" · "),{style:"margin:6px 0"}));
    const photoHost=el("details");
    photoHost.hidden=true;
    photoHost.append(el("summary","Stop photo"));
    content.append(photoHost);
    state.preview.currentLabel.remove();
    state.preview.mapCard=state.L.popup({offset:[0,-13],maxWidth:275,maxHeight:Math.floor(state.map.getSize().y*0.64),autoPanPadding:[12,12],closeOnClick:false})
      .setLatLng(stop.point).setContent(content).openOn(state.map);
    photoHost.addEventListener("toggle",()=>state.preview?.mapCard?.update());
    let rank=Infinity;
    return (entry,photo)=>{
      const priority=entry.type==="Campground"?0:entry.type==="Park or destination"?1:2;
      if(!photoHost.isConnected||priority>=rank) return;
      const image=el("img",undefined,{src:photo.src,alt:photo.alt,style:"display:block;width:100%;max-height:105px;object-fit:cover;border-radius:6px"});
      const caption=el("figcaption",entry.name+" · "+photo.description,{style:"font-size:11px;line-height:1.3"});
      const link=el("a","Photo credit",{href:photo.url,target:"_blank",rel:"noopener noreferrer",style:"font-size:11px"});
      const figure=el("figure",undefined,{style:"margin:7px 0"});
      figure.append(image,caption,link);
      image.onload=()=>{
        if(!photoHost.isConnected||priority>=rank) return;
        rank=priority;
        photoHost.replaceChildren(el("summary","Stop photo"),figure);
        photoHost.hidden=false;
        state.preview?.mapCard?.update();
      };
    };
  }
  function renderDetailedStop(state,stop,segment,days,attractions,showOnMap) {
    const {trip,panel}=state;
    if(days.length){
      const first=days[0].dayNumber,last=days.at(-1).dayNumber;
      if(first!=null) panel.append(el("p",first===last?"Day "+first:"Days "+first+"–"+last));
    }
    const entries=[];
    function card(name,type,location){
      const section=el("section",undefined,{class:"dayitem"});
      section.append(el("h4",name),el("p",type),mapsLink("View on map",name,location));
      panel.append(section);
      entries.push({card:section,name,type,park:segment?.park});
      return section;
    }
    const campground=findDetailedCampground(trip,segment);
    if(segment?.campground){
      const section=card(segment.campground,"Campground",segment.location);
      const fields=el("dl",undefined,{class:"npt-stay-fields"});
      dataRow(fields,"Nights",segment.nights);
      dataRow(fields,"Hookups",segment.hookups||campground?.hookups);
      dataRow(fields,"RV length limit",campground?.maxRVFeet?campground.maxRVFeet+" ft":null);
      section.append(fields);
      if(campground?.reservationNotes) section.append(el("p",campground.reservationNotes));
      const url=campground&&bookingLink(campground);
      if(url) section.append(" · ",el("a","Booking information",{href:url,target:"_blank",rel:"noopener noreferrer"}));
    }
    if(segment?.park&&!/travel day/i.test(segment.park)&&segment.park!==segment.campground) card(segment.park,"Park or destination",segment.location);
    else if(segment?.location&&segment.location!==segment.campground) card(segment.location,"Stopover",undefined);
    for(const name of attractions) card(name,"Attraction or activity",segment?.park||segment?.location);
    if(!entries.length) panel.append(el("p","No additional stops or activities are listed here."));
    if(showOnMap){
      const updateMapPhoto=openDetailedMapCard(state,stop,segment,days,campground,attractions);
      for(const entry of entries) entry.onPhoto=photo=>updateMapPhoto(entry,photo);
    }
    loadStopPhotos(state,entries);
  }
  function previewHighlights(state,stop,showOnMap=false) {
    const {trip,panel}=state;
    const segment=trip.segments[stop.index-1];
    const days=segment?trip.days.filter(day=>String(day.segmentNumber)===String(segment.sequence)):[];
    const title=stop.index===0?trip.startLocation:segment?.park||segment?.location||trip.endLocation;
    const stopTitle=previewStopTitle(state,stop);
    panel.replaceChildren(el("h3",stopTitle));
    if(title&&title!==stopTitle) panel.append(el("p",title));
    if(segment?.location&&segment.location!==title&&segment.location!==stopTitle) panel.append(el("p",segment.location));
    if(segment?.nights) panel.append(el("p",segment.nights+(segment.nights===1?" night":" nights")));
    if(state.mode!=="details") addLandmarkPhoto(state,title);
    const attractions=[...new Set(days.flatMap(day=>(day.activities||[]).map(a=>typeof a==="string"?a:a?.name)).filter(name=>
      name&&!/fuel|check propane|campground setup|laundry|groceries|dump station|drive and|planning|travel day|set up camp/i.test(name)))];
    if(state.mode==="details") renderDetailedStop(state,stop,segment,days,attractions,showOnMap);
    else if(attractions.length){
      const list=el("ul");
      attractions.slice(0,3).forEach(name=>list.append(el("li",name)));
      panel.append(el("h4","Planned highlights"),list);
    }
    if(days.length) panel.append(button("Open Day "+days[0].dayNumber,()=>state.select(trip.days.indexOf(days[0]))));
  }
  function stopPreview(state) {
    const preview=state.preview;
    if(!preview) return;
    cancelAnimationFrame(preview.frame);
    state.map.stop();
    preview.marker.remove();
    preview.currentLabel.remove();
    preview.nextLabel.remove();
    preview.mapCard?.remove();
    state.preview=null;
    state.pause.hidden=true;
    state.overview.hidden=true;
    state.jump.value="";
  }
  function fitPreviewLeg(map,L,points,reduced,speed) {
    const size=map.getSize();
    const options={
      padding:[Math.min(122,Math.floor(size.x/4)),Math.min(75,Math.floor(size.y/5))],
      maxZoom:13
    };
    const bounds=L.latLngBounds(points);
    if(reduced) map.fitBounds(bounds,{...options,animate:false});
    else map.flyToBounds(bounds,{...options,duration:0.5/speed});
  }
  function playPreview(state,selectedStop=null) {
    if(!state.map) return;
    state.select(null);
    const stops=state.route.flatMap((point,index)=>point?[{point,index}]:[]);
    if(stops.length<2) return;
    const startIndex=selectedStop===null?0:stops.findIndex(stop=>stop.index===selectedStop);
    if(startIndex<0) return;
    const start=stops[startIndex];
    const atStop=selectedStop!==null&&state.mode==="details";
    const {L,map}=state;
    const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
    const preview={stops,index:startIndex,elapsed:0,last:null,frame:0,paused:atStop,atStop,
      done:startIndex===stops.length-1,newLeg:true,marker:L.marker(start.point,{
        icon:L.divIcon({className:"leaflet-div-icon",html:'<span class="npt-map-pin current" aria-hidden="true">➤</span>',iconSize:[25,25],iconAnchor:[12,12]}),
        zIndexOffset:1500,interactive:false
      }).addTo(map)};
    state.preview=preview;
    state.pause.hidden=false;
    state.pause.textContent=preview.done?"Replay":atStop?"Continue":"Pause";
    state.overview.hidden=false;
    preview.currentLabel=L.tooltip({permanent:true,direction:"top",offset:[0,-13],opacity:1});
    preview.nextLabel=L.tooltip({permanent:true,direction:"bottom",offset:[0,13],opacity:1});
    showPreviewStop(state,preview.currentLabel,start);
    if(atStop) map.setView(start.point,Math.min(12,Math.max(9,map.getZoom())),{animate:false});
    previewHighlights(state,start,atStop);
    state.jump.value=String(start.index);
    const tick=now=>{
      if(state.preview!==preview||preview.paused) return;
      const from=stops[preview.index], to=stops[preview.index+1];
      if(preview.newLeg){
        const road=to.index===from.index+1?state.roads?.[from.index]:null;
        preview.points=road?[from.point,...road,to.point]:[from.point,to.point];
        preview.sample=previewLeg(preview.points);
        const miles=milesBetween(from.point,to.point);
        fitPreviewLeg(map,L,preview.points,reduced,state.speed);
        if(miles>0) showPreviewStop(state,preview.nextLabel,to);
        preview.hold=preview.index===0?950:1500;
        preview.travel=Math.min(4500,Math.max(1850,1600+miles*7));
        preview.newLeg=false;
      }
      if(preview.last!==null) preview.elapsed+=Math.max(0,now-preview.last)*state.speed;
      preview.last=now;
      const fraction=Math.min(1,Math.max(0,(preview.elapsed-preview.hold)/preview.travel));
      if(fraction>0&&(!reduced||fraction===1)) preview.marker.setLatLng(preview.sample(fraction));
      if(fraction===1){
        preview.nextLabel.remove();
        showPreviewStop(state,preview.currentLabel,to);
        previewHighlights(state,to,state.mode==="details");
        state.jump.value=String(to.index);
        preview.index++;
        if(preview.index===stops.length-1){
          preview.done=true;
          state.pause.textContent="Replay";
          return;
        }
        preview.elapsed=0;
        preview.newLeg=true;
        if(state.mode==="details"){
          preview.paused=true;
          preview.atStop=true;
          state.pause.textContent="Continue";
          return;
        }
      }
      preview.frame=requestAnimationFrame(tick);
    };
    preview.toggle=()=>{
      if(preview.done){playPreview(state);return;}
      preview.paused=!preview.paused;
      state.pause.textContent=preview.paused?(preview.atStop?"Continue":"Resume"):"Pause";
      if(preview.paused){
        cancelAnimationFrame(preview.frame);
        map.stop();
      } else {
        if(preview.atStop){
          preview.mapCard?.remove();
          preview.mapCard=null;
          showPreviewStop(state,preview.currentLabel,stops[preview.index]);
          preview.atStop=false;
        }
        if(preview.points&&!preview.newLeg) fitPreviewLeg(map,L,preview.points,reduced,state.speed);
        preview.last=null;
        preview.frame=requestAnimationFrame(tick);
      }
    };
    if(!preview.paused&&!preview.done) preview.frame=requestAnimationFrame(tick);
  }
  async function loadRoads(state,control){
    if(state.trip.privacy!=="public"||state.route.some(p=>!p)) return;
    control.disabled=true;
    state.key.textContent="Loading the driving route...";
    try {
      const coords=state.route.map(([lat,lon])=>lon+","+lat).join(";");
      const response=await fetch("https://routing.openstreetmap.de/routed-car/route/v1/driving/"+coords+
        "?overview=false&steps=true&geometries=geojson",{signal:state.abort.signal});
      if(!response.ok) throw Error("Road routing unavailable.");
      const json=await response.json();
      const legs=json.routes?.[0]?.legs;
      if(legs?.length!==state.route.length-1) throw Error("Road routing did not return all legs.");
      if(active!==state) return;
      state.roads=legs.map(leg=>leg.steps.flatMap(step=>step.geometry.coordinates.map(([lon,lat])=>[lat,lon])).filter(Boolean)).map(leg=>leg.length>1?leg:null);
      if(!state.preview) drawWalk(state);
      control.hidden=true;
    } catch(error){
      if(active===state) state.key.textContent="Road routing is unavailable. The dashed stop connections are still visible.";
    } finally {control.disabled=false;}
  }
  window.closeNptWalk=()=>{
    if(!active) return;
    stopPreview(active);
    active.abort.abort();
    active.map?.remove();
    active.root.remove();
    active=null;
  };
  window.openNptWalk=async trip=>{
    window.closeNptWalk();
    document.getElementById("home").style.display="none";
    document.getElementById("viewer").classList.remove("open");
    const root=el("section",undefined,{class:"npt-walk"});
    const title=el("h2",trip.name);
    const nav=el("div",undefined,{class:"npt-walk-nav"});
    const layout=el("div",undefined,{class:"npt-walk-layout"});
    const mapNode=el("div",undefined,{class:"npt-map","aria-label":"Interactive itinerary map"});
    const panel=el("aside",undefined,{class:"dayitem npt-walk-panel","aria-label":"Itinerary details"});
    const key=el("p","Loading the map…",{role:"status",class:"npt-map-key"});
    const prev=button("Previous Day",()=>state.select(Math.max((state.dayIndex??0)-1,0)));
    const next=button("Next Day",()=>state.select(Math.min((state.dayIndex??-1)+1,trip.days.length-1)));
    const select=el("select",undefined,{"aria-label":"Jump to Day"});
    select.append(el("option","Jump to Day",{value:""}));
    trip.days.forEach((day,i)=>select.append(el("option",`Day ${day.dayNumber||i+1} · ${day.park||day.location||"Travel"}`,{value:String(i)})));
    const roads=button("Load road route",()=>loadRoads(state,roads));
    roads.hidden=true;
    const mode=el("select",undefined,{"aria-label":"Preview mode"});
    mode.append(el("option","Route Overview",{value:"overview"}),el("option","Detailed Stops",{value:"details"}));
    const jump=el("select",undefined,{"aria-label":"Jump to Stop"});
    jump.append(el("option","Jump to Stop",{value:""}));
    jump.hidden=true;
    jump.disabled=true;
    const fullTrip=button("Play Preview",()=>playPreview(state));
    fullTrip.disabled=true;
    const pause=button("Pause",()=>state.preview?.toggle());
    const overview=button("Map overview",()=>state.select(null));
    pause.hidden=true;
    overview.hidden=true;
    const speed=el("select",undefined,{"aria-label":"Preview speed"});
    speed.append(el("option","0.5× speed",{value:"0.5"}),el("option","Normal speed",{value:"1"}),el("option","2× speed",{value:"2"}),el("option","4× speed",{value:"4"}));
    speed.value="1";
    speed.onchange=()=>{state.speed=Number(speed.value);};
    const state={root,trip,key,panel,pause,overview,jump,mode:"overview",speed:1,dayIndex:null,abort:new AbortController(),
      route:[point(trip.preferences?.mapStart),...trip.segments.map(s=>point(s.mapPoint)),point(trip.preferences?.mapEnd)],
      select(index){
        stopPreview(state);
        state.dayIndex=index;
        select.value=index===null?"":String(index);
        prev.disabled=index===null||index===0;
        next.disabled=index!==null&&index===trip.days.length-1;
        if(state.map) drawWalk(state);
      }};
    active=state;
    state.route.forEach((coords,index)=>{
      if(coords) jump.append(el("option",`${index===0?"Departure":index===state.route.length-1?"Return":"Stop "+index} · ${previewStopTitle(state,{index})}`,{value:String(index)}));
    });
    mode.onchange=()=>{
      state.mode=mode.value;
      jump.hidden=state.mode!=="details";
      state.select(null);
    };
    jump.onchange=()=>{if(jump.value!=="") playPreview(state,Number(jump.value));};
    select.onchange=()=>state.select(select.value===""?null:Number(select.value));
    nav.append(button("Back to trips",()=>window.showHome()),mode,fullTrip,pause,overview,jump,speed,prev,next,select,roads);
    layout.append(mapNode,panel);
    const legend=el("p","⛺ Campground   ◆ Attraction or park   • Route stop   ⚑ Trip endpoint",{class:"npt-map-key"});
    root.append(title,nav,layout,legend,key);
    document.getElementById("viewer").after(root);
    window.scrollTo(0,0);
    state.select(null);
    try {
      const L=await leaflet();
      if(active!==state) return;
      state.L=L;
      state.map=L.map(mapNode,{scrollWheelZoom:false}).setView([43,-104],4);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(state.map);
      drawWalk(state);
      fullTrip.disabled=state.route.filter(Boolean).length<2;
      jump.disabled=fullTrip.disabled;
      roads.hidden=trip.privacy!=="public"||state.route.some(p=>!p);
      if(state.route.some(p=>!p)) key.textContent="Some route stops do not have map coordinates.";
    } catch(error){
      key.textContent="The interactive map could not load.";
      const items=el("ol");
      trip.days.forEach((day,i)=>items.append(el("li",`Day ${day.dayNumber||i+1} · ${[day.park,day.campground].filter(Boolean).join(" · ")}`)));
      panel.append(items);
    }
  };
})();
