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
export function announcementDate(a){
 const format=value=>{const text=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return '';const day=new Date(text+'T00:00:00Z');if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==text)return '';return Number(text.slice(5,7))+'/'+Number(text.slice(8,10))+'（'+'日一二三四五六'[day.getUTCDay()]+'）'};
 if(a.multiSessionEnabled){const dates=[...new Set((a.sessions||[]).map(s=>s.date).filter(Boolean))].sort().map(format).filter(Boolean);if(dates.length)return dates.join('、')}
 const start=format(a.date),end=a.dateMode==='multi'?format(a.endDate):'';
 return start&&end&&a.date!==a.endDate?start+'～'+end:start;
}
export function buildStudentAnnouncement(activities,baseUrl,now=Date.now(),options={}){
 const rows=announcementActivities(activities,now);
 if(!rows.length)return {text:'目前沒有可報名的活動。',rows};
 const text='近期活動要玩什麼？歡迎各位踴躍報名參加！\n\n'+rows.map((a,i)=>{const url=new URL('frontend/activity.html',baseUrl.endsWith('/')?baseUrl:baseUrl+'/');url.searchParams.set('id',a.id);const link=options.shortBase&&/^[A-Za-z0-9_-]{1,128}$/.test(a.id)?options.shortBase.replace(/\/$/,'')+'/a/'+a.id:url.href;const date=announcementDate(a);return `${i+1}. ${String(a.title||'未命名活動').replace(/\s+/g,' ').trim()}${date?'｜'+date:''}\n報名連結：${link}`}).join('\n\n');
 return {text,rows};
}
