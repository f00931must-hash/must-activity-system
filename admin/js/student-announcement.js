// Read-only announcement generation; never changes activities or registrations.
function localInstant(value){
 if(!value)return null;if(typeof value.toMillis==='function')return value.toMillis();
 const text=String(value).trim(),normalized=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text)?text+'+08:00':text;
 const timestamp=Date.parse(normalized);return Number.isFinite(timestamp)?timestamp:null;
}
function taipeiDay(now){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));return ['year','month','day'].map(type=>p.find(x=>x.type===type).value).join('-')}
export function announcementActivities(activities,now=Date.now()){
 const today=taipeiDay(now);
 return activities.filter(a=>{
  if(a.published===false||a.status!=='open'||!a.id)return false;
  const open=localInstant(a.registerOpenAt),close=localInstant(a.registerCloseAt);
  if(open!==null&&now<open||close!==null&&now>=close)return false;
  const capacity=Number(a.capacity||0);if(capacity>0&&Number(a.registeredCount||0)>=capacity)return false;
  const dates=[a.date,a.dateMode==='multi'?a.endDate:null,...(a.multiSessionEnabled?(a.sessions||[]).map(s=>s.date):[])].filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||'')));
  return !dates.length||dates.sort().at(-1)>=today;
 }).sort((a,b)=>String(a.date||'9999').localeCompare(String(b.date||'9999'))||String(a.title||'').localeCompare(String(b.title||''),'zh-Hant'));
}
export function buildStudentAnnouncement(activities,baseUrl,now=Date.now()){
 const rows=announcementActivities(activities,now);
 if(!rows.length)return {text:'目前沒有可報名的活動。',rows};
 const text='近期活動要玩什麼？歡迎各位報名！\n\n'+rows.map((a,i)=>{const url=new URL('frontend/activity.html',baseUrl.endsWith('/')?baseUrl:baseUrl+'/');url.searchParams.set('id',a.id);return `${i+1}. ${String(a.title||'未命名活動').replace(/\s+/g,' ').trim()}\n報名連結：${url.href}`}).join('\n\n');
 return {text,rows};
}
