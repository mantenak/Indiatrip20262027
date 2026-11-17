/* Pure planning calculations, shared by the website and regression checks. */
(function(root){
'use strict';
const pt=x=>Array.isArray(x)&&x.length===2&&x.every(Number.isFinite)?x:null;
function miles(a,b){if(!pt(a)||!pt(b))return Infinity;const r=Math.PI/180,dlat=(b[0]-a[0])*r,dlon=(b[1]-a[1])*r;return 3958.76*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dlon/2)**2)));}
const point=p=>[Number(p.latitude),Number(p.longitude)];
function chooseParks(parks,start,end,days,hours,distance=250){
 const max=Math.min(12,Math.max(1,Math.floor((days-1)/3))),budget=Math.max(hours,days*hours*.45),chosen=[];let current=start,spent=0;
 const remaining=parks.filter(p=>p.latitude!=null&&p.longitude!=null&&miles(start,point(p))<days*hours*30);
 while(chosen.length<max){
  const feasible=remaining.filter(p=>!chosen.includes(p)).map(p=>({p,d:miles(current,point(p))*1.3/45,back:miles(point(p),end)*1.3/45})).filter(x=>x.d<=hours*1.5&&x.d*45<=distance*1.5&&spent+x.d+x.back<=budget);
  feasible.sort((a,b)=>(a.d+a.back*.12+Math.max(0,a.d*45-distance)/30+(a.p.designation==='state_park'?1.2:0))-(b.d+b.back*.12+Math.max(0,b.d*45-distance)/30+(b.p.designation==='state_park'?1.2:0)));
  if(!feasible.length)break;
  const x=feasible[0];chosen.push(x.p);spent+=x.d;current=point(x.p);
 }
 return chosen;
}
function fit(c,vehicle){
 const trailer=['fifthWheel','trailer'].includes(vehicle.type),length=Number(vehicle.rvLength)||0;
 if(vehicle.type==='car')return {ok:true,unknown:false,label:'Confirm tent-site availability'};
 const allowed=trailer?c.trailer_allowed:c.rv_allowed,limit=Number(trailer?c.max_trailer_length_ft:c.max_rv_length_ft)||null;
 if(allowed===false||limit&&length>limit)return {ok:false,unknown:false,label:'Does not fit selected equipment'};
 const unknown=!length||allowed==null||limit==null;
 return {ok:true,unknown,label:unknown?'Equipment fit needs confirmation':`Reported limit ${limit} ft — confirm individual site`};
}
const hookups=c=>!c?'Not selected':c.electric_hookups===true&&c.water_hookups===true&&c.sewer_hookups===true?'Full hookups':c.electric_hookups===true?'Electric; water/sewer not confirmed':c.electric_hookups===false?'No electric hookups':'Hookups unknown';
function buildTrip(model){
 const {basics,stops}=model;let dayNumber=1;const days=[],segments=[],campgrounds=[];
 stops.forEach((s,i)=>{
  const seq=i+1,c=s.campground,leg=model.route?.legs?.[i],activities=s.activities||[];
  const mapPoint=c&&c.latitude!=null&&c.longitude!=null?point(c):point(s.park);
  const cg=c?.name||'',loc=c?.region||s.park.region||'',h=hookups(c),prev=i?stops[i-1].campground?.name||stops[i-1].park.name:basics.start.name;
  const notes=[s.notes,!c?'Choose a campground before booking.':fit(c,basics.vehicle).label,'Reservations and security incidents have not been verified.'].filter(Boolean).join(' ');
  segments.push({sequence:seq,park:s.park.name,location:loc,campground:cg,hookups:h,nights:s.nights,mapPoint,driveFrom:prev,driveTo:cg||s.park.name,driveMiles:leg?Math.round(leg.distance/1609.344):null,driveMinutes:leg?Math.round(leg.duration/60):null,notes,catalogParkId:s.park.id,catalogCampgroundId:c?.id||null});
  for(let n=0;n<s.nights;n++)days.push({dayNumber:dayNumber++,segmentNumber:seq,park:s.park.name,location:loc,campground:cg,hookups:h,activities:activities.filter((a,j)=>j%s.nights===n).map(a=>a.name),driveFrom:n===0?prev:'',driveTo:n===0?cg||s.park.name:'',driveMiles:n===0&&leg?Math.round(leg.distance/1609.344):null,driveMinutes:n===0&&leg?Math.round(leg.duration/60):null,notes});
  if(c&&!campgrounds.some(x=>x.catalogId===c.id))campgrounds.push({catalogId:c.id,name:c.name,park:s.park.name,location:loc,hookups:h,mapPoint,bookingURL:c.reservation_url||c.official_url,officialURL:c.official_url,maxRVFeet:c.max_rv_length_ft,maxTrailerFeet:c.max_trailer_length_ft,reservationNotes:c.reservation_notes||'Check the official booking page for dates and availability.',reserved:false,availabilityStatus:'Unverified'});
 });
 const last=model.route?.legs?.at(-1);days.push({dayNumber:dayNumber++,park:'Travel to '+basics.end.name,location:basics.end.name,campground:'',activities:[],driveFrom:stops.at(-1)?.campground?.name||stops.at(-1)?.park.name||basics.start.name,driveTo:basics.end.name,driveMiles:last?Math.round(last.distance/1609.344):null,driveMinutes:last?Math.round(last.duration/60):null,notes:'Driving estimates do not validate RV clearances or road restrictions.'});
 return {name:basics.name||'My National Park Trip',startDate:basics.date,length:days.length,startLocation:basics.start.name,endLocation:basics.end.name,vehicle:basics.vehicle,parks:stops.map(s=>s.park.name),days,segments,campgrounds,privacy:'private',preferences:{campground:'Park campgrounds and established chains',maxDriveHours:basics.hours,pace:'Balanced',preferredDriveMiles:basics.distance,mapStart:basics.start.point,mapEnd:basics.end.point,planner:JSON.parse(JSON.stringify(model))}};
}
const api={miles,point,chooseParks,fit,hookups,buildTrip};root.NptPlannerCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
