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
          button("Departure",()=>state.select(0)),button("Return",()=>state.select(trip.days.length-1)));
        marker.bindPopup(popup);
        return;
      }
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
  function previewHighlights(state,stop) {
    const {trip,panel}=state;
    const segment=trip.segments[stop.index-1];
    const days=segment?trip.days.filter(day=>String(day.segmentNumber)===String(segment.sequence)):[];
    const title=stop.index===0?trip.startLocation:segment?.park||segment?.location||trip.endLocation;
    const stopTitle=previewStopTitle(state,stop);
    panel.replaceChildren(el("h3",stopTitle));
    if(title&&title!==stopTitle) panel.append(el("p",title));
    if(segment?.location&&segment.location!==title&&segment.location!==stopTitle) panel.append(el("p",segment.location));
    if(segment?.nights) panel.append(el("p",segment.nights+(segment.nights===1?" night":" nights")));
    addLandmarkPhoto(state,title);
    const attractions=[...new Set(days.flatMap(day=>(day.activities||[]).map(a=>typeof a==="string"?a:a?.name)).filter(name=>
      name&&!/fuel|check propane|campground setup|laundry|groceries|dump station|drive and|planning|travel day|set up camp/i.test(name)))];
    if(attractions.length){
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
    state.preview=null;
    state.pause.hidden=true;
    state.overview.hidden=true;
  }
  function playPreview(state) {
    if(!state.map) return;
    state.select(null);
    const stops=state.route.flatMap((point,index)=>point?[{point,index}]:[]);
    if(stops.length<2) return;
    const {L,map}=state;
    const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
    const preview={stops,index:0,elapsed:0,last:null,frame:0,paused:false,
      newLeg:true,marker:L.marker(stops[0].point,{
        icon:L.divIcon({className:"leaflet-div-icon",html:'<span class="npt-map-pin current" aria-hidden="true">➤</span>',iconSize:[25,25],iconAnchor:[12,12]}),
        zIndexOffset:1500,interactive:false
      }).addTo(map)};
    state.preview=preview;
    state.pause.hidden=false;
    state.pause.textContent="Pause";
    state.overview.hidden=false;
    preview.currentLabel=L.tooltip({permanent:true,direction:"top",offset:[0,-13],opacity:1});
    preview.nextLabel=L.tooltip({permanent:true,direction:"bottom",offset:[0,13],opacity:1});
    showPreviewStop(state,preview.currentLabel,stops[0]);
    previewHighlights(state,stops[0]);
    map.setView(stops[0].point,9,{animate:false});
    const tick=now=>{
      if(state.preview!==preview||preview.paused) return;
      const from=stops[preview.index], to=stops[preview.index+1];
      if(preview.newLeg){
        const road=to.index===from.index+1?state.roads?.[from.index]:null;
        preview.sample=previewLeg(road?[from.point,...road,to.point]:[from.point,to.point]);
        const miles=milesBetween(from.point,to.point);
        preview.zoom=miles<100?8.5:7.5;
        preview.close=miles<35;
        preview.following=false;
        preview.approaching=false;
        preview.nextLabel.remove();
        if(preview.close&&miles>0){
          const center=from.point.map((value,k)=>(value+to.point[k])/2);
          const fitZoom=map.getBoundsZoom(L.latLngBounds([from.point,to.point]),false,[110,110]);
          const zoom=Math.min(13,fitZoom);
          if(reduced) map.setView(center,zoom,{animate:false});
          else map.flyTo(center,zoom,{duration:0.45});
          showPreviewStop(state,preview.nextLabel,to);
        } else if(!preview.close&&map.getZoom()!==Math.round(preview.zoom)){
          if(reduced) map.setView(from.point,preview.zoom,{animate:false});
          else map.flyTo(from.point,preview.zoom,{duration:0.45});
        }
        preview.hold=preview.index===0?950:1500;
        preview.travel=Math.min(4500,Math.max(1850,1600+miles*7));
        preview.newLeg=false;
      }
      if(preview.last!==null) preview.elapsed+=Math.max(0,now-preview.last)*state.speed;
      preview.last=now;
      const fraction=Math.min(1,Math.max(0,(preview.elapsed-preview.hold)/preview.travel));
      if(!preview.close&&fraction>=0.6&&fraction<1&&!preview.approaching){
        showPreviewStop(state,preview.nextLabel,to);
        preview.approaching=true;
      }
      if(!preview.close&&!reduced&&fraction>0&&fraction<1&&!preview.following){
        preview.following=true;
        map.panTo(to.point,{animate:true,duration:(1-fraction)*preview.travel/(1000*state.speed),easeLinearity:1});
      }
      if(fraction>0&&(!reduced||fraction===1)) preview.marker.setLatLng(preview.sample(fraction));
      if(reduced&&!preview.close&&fraction===1) map.panTo(to.point,{animate:false});
      if(fraction===1){
        preview.nextLabel.remove();
        showPreviewStop(state,preview.currentLabel,to);
        previewHighlights(state,to);
        preview.index++;
        if(preview.index===stops.length-1){
          preview.done=true;
          state.pause.textContent="Replay";
          return;
        }
        preview.elapsed=0;
        preview.newLeg=true;
      }
      preview.frame=requestAnimationFrame(tick);
    };
    preview.toggle=()=>{
      if(preview.done){playPreview(state);return;}
      preview.paused=!preview.paused;
      state.pause.textContent=preview.paused?"Resume":"Pause";
      if(preview.paused){
        cancelAnimationFrame(preview.frame);
        map.stop();
        preview.following=false;
      } else {preview.last=null;preview.frame=requestAnimationFrame(tick);}
    };
    preview.frame=requestAnimationFrame(tick);
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
    const fullTrip=button("Play Preview",()=>playPreview(state));
    fullTrip.disabled=true;
    const pause=button("Pause",()=>state.preview?.toggle());
    const overview=button("Map overview",()=>state.select(null));
    pause.hidden=true;
    overview.hidden=true;
    const speed=el("select",undefined,{"aria-label":"Preview speed"});
    speed.append(el("option","0.5× speed",{value:"0.5"}),el("option","Normal speed",{value:"1"}),el("option","2× speed",{value:"2"}),el("option","4× speed",{value:"4"}));
    speed.value="1";
    speed.onchange=()=>{
      state.speed=Number(speed.value);
      if(state.preview?.following){
        state.map.stop();
        state.preview.following=false;
        state.preview.last=null;
      }
    };
    const state={root,trip,key,panel,pause,overview,speed:1,dayIndex:null,abort:new AbortController(),
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
    select.onchange=()=>state.select(select.value===""?null:Number(select.value));
    nav.append(button("Back to trips",()=>window.showHome()),fullTrip,pause,overview,speed,prev,next,select,roads);
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
