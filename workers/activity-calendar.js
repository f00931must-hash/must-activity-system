// MUST activity calendar: calendar sync v1.1.0.
// Required: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CALENDAR_KV.
// Activity writes require a verified Firebase teacher account and use the selected calendar only.
const ADMIN = "master004400@gmail.com";
const CALENDAR_NAME = "明新資源教室行事曆";
const te = new TextEncoder();
const td = new TextDecoder();
const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
const un64 = s => Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
async function key(env){return crypto.subtle.importKey("raw",te.encode(env.GOOGLE_CLIENT_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);}
async function sign(data,env){const p=b64(te.encode(JSON.stringify(data)));return p+"."+b64(await crypto.subtle.sign("HMAC",await key(env),te.encode(p)));}
async function verify(value,env){
  const [p,s,...rest]=String(value||"").split(".");
  if(!p||!s||rest.length||!await crypto.subtle.verify("HMAC",await key(env),un64(s),te.encode(p)))throw Error("授權工作階段無效，請重新連結。");
  const d=JSON.parse(td.decode(un64(p)));
  if(!d.exp||d.exp<Date.now())throw Error("授權工作階段已逾時，請重新連結。");
  return d;
}
function cookie(req,name){return req.headers.get("Cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="))?.slice(name.length+1)||"";}
function setCookie(name,value,age){return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;}
async function encryptionKey(env){return crypto.subtle.importKey("raw",await crypto.subtle.digest("SHA-256",te.encode("must-calendar-tokens:"+env.GOOGLE_CLIENT_SECRET)),"AES-GCM",false,["encrypt","decrypt"]);}
async function saveTokens(env,tokens){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:"AES-GCM",iv},await encryptionKey(env),te.encode(JSON.stringify(tokens)));
  await env.CALENDAR_KV.put("oauth:tokens",JSON.stringify({iv:b64(iv),data:b64(data)}));
}
async function readTokens(env){
  const v=await env.CALENDAR_KV.get("oauth:tokens","json");
  if(!v)throw Error("尚未連結 Google 日曆。");
  return JSON.parse(td.decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:un64(v.iv)},await encryptionKey(env),un64(v.data))));
}
async function googleToken(env,fields){
  const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,...fields})});
  const d=await r.json();
  if(!r.ok)throw Error("Google 授權失敗，請確認密鑰與重新導向網址，或重新授權。");
  return d;
}
async function accessToken(env){
  const t=await readTokens(env);
  if(t.expiresAt>Date.now()+60000)return t.access_token;
  const n=await googleToken(env,{grant_type:"refresh_token",refresh_token:t.refresh_token});
  await saveTokens(env,{...t,...n,refresh_token:n.refresh_token||t.refresh_token,expiresAt:Date.now()+Number(n.expires_in||3600)*1000});
  return n.access_token;
}
async function calendars(env){
  const token=await accessToken(env),list=[];let page="";
  do{
    const u=new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");u.searchParams.set("maxResults","250");if(page)u.searchParams.set("pageToken",page);
    const r=await fetch(u,{headers:{Authorization:"Bearer "+token}});if(!r.ok)throw Error("無法讀取日曆清單，請重新授權。");
    const d=await r.json();list.push(...(d.items||[]));page=d.nextPageToken||"";
  }while(page);
  return list.filter(c=>["owner","writer"].includes(c.accessRole)&&[c.summary,c.summaryOverride].includes(CALENDAR_NAME));
}
function html(body,status=200,headers={}){return new Response(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>資教活動日曆連結</title><style>body{font-family:system-ui;background:#f3f6fa;color:#243447;margin:0;padding:24px}main{max-width:620px;margin:40px auto;background:white;border-radius:18px;padding:28px}a,button{display:inline-block;padding:12px 18px;background:#1769aa;color:white;border:0;border-radius:9px;text-decoration:none;cursor:pointer}p{line-height:1.7}select{width:100%;padding:12px;margin:12px 0}</style><main>${body}</main></html>`,{status,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",...headers}});}
async function session(req,env){const s=await verify(cookie(req,"calendar_session"),env);if(s.kind!=="session"||s.email!==ADMIN)throw Error("請先以管理員帳號連結。");return s;}

const FIREBASE_PROJECT="must-activity-form";
const FIREBASE_KEY="AIzaSyDjrdWAzIKcrClSdH8hlcmVgjQDR0K62hg";
const FRONT_ORIGIN="https://f00931must-hash.github.io";
function decodeValue(v){
  if(!v)return null;if("stringValue" in v)return v.stringValue;if("booleanValue" in v)return v.booleanValue;
  if("integerValue" in v)return Number(v.integerValue);if("doubleValue" in v)return v.doubleValue;
  if("timestampValue" in v)return v.timestampValue;
  if(v.arrayValue)return (v.arrayValue.values||[]).map(decodeValue);
  if(v.mapValue)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decodeValue(x)]));return null;
}
async function firestore(path,token){
  const r=await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/${path}`,{headers:{Authorization:"Bearer "+token}});
  if(r.status===404)return null;if(!r.ok)throw Error("無權讀取活動或教師權限資料。");const d=await r.json();return decodeValue({mapValue:{fields:d.fields}});
}
async function teacher(req){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer /,"");if(!token)throw Error("請先登入活動系統。");
  const claims=JSON.parse(td.decode(un64(token.split(".")[1]||"")));
  if(claims.aud!==FIREBASE_PROJECT||claims.iss!==`https://securetoken.google.com/${FIREBASE_PROJECT}`)throw Error("登入專案不符。");
  const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_KEY}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:token})});
  if(!r.ok)throw Error("登入已逾時，請重新登入。");const d=await r.json(),u=d.users?.[0];
  if(!u||u.disabled||!u.emailVerified)throw Error("帳號尚未通過驗證。");
  const email=String(u.email||"").toLowerCase();
  if(email!==ADMIN){const a=await firestore("settings/admins",token);if(!(a?.emails||[]).map(x=>String(x).toLowerCase()).includes(email))throw Error("此帳號沒有活動管理權限。");}
  return {token,email};
}
function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||""))throw Error("活動日期格式不正確。");const d=new Date(s+"T00:00:00Z");if(Number.isNaN(+d)||d.toISOString().slice(0,10)!==s)throw Error("活動日期無效。");return s;}
function nextDay(s){return new Date(Date.parse(validDate(s)+"T00:00:00Z")+86400000).toISOString().slice(0,10);}
function eventTimes(start,end,range){
  validDate(start);validDate(end);if(end<start)throw Error("結束日期不可早於開始日期。");
  const times=String(range||"").match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g)||[];
  if(times.length===2){const a=times[0].padStart(5,"0"),b=times[1].padStart(5,"0");let finish=end;if(finish===start&&b<=a)finish=nextDay(end);return {start:{dateTime:`${start}T${a}:00+08:00`,timeZone:"Asia/Taipei"},end:{dateTime:`${finish}T${b}:00+08:00`,timeZone:"Asia/Taipei"}};}
  if(String(range||"").trim())throw Error("活動時間需完整填寫開始與結束時間。");
  return {start:{date:start},end:{date:nextDay(end)}};
}
async function eventId(calendarId,id,part){return "must"+Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",te.encode(JSON.stringify([FIREBASE_PROJECT,calendarId,id,part])))),x=>x.toString(16).padStart(2,"0")).join("");}
async function desiredEvents(a,id,calendarId){
  if(!a||a.deleted===true||["cancelled","canceled"].includes(a.status))return [];
  const parts=a.multiSessionEnabled?(a.sessions||[]).map((s,i)=>({key:s.id||String(i),date:s.date,end:s.date,time:s.startTime&&s.endTime?`${s.startTime}～${s.endTime}`:(s.startTime||s.endTime||""),location:s.location||a.location})):[{key:"main",date:a.date,end:a.dateMode==="multi"?a.endDate:a.date,time:a.activityTime||a.plannedTime||a.time||"",location:a.location}];
  if(!parts.length)throw Error("多場次活動沒有場次資料。");
  return Promise.all(parts.map(async p=>({id:await eventId(calendarId,id,p.key),summary:String(a.title||"資教活動"),location:String(p.location||""),description:String(a.description||"")+"\n\n活動報名：https://f00931must-hash.github.io/must-activity-system/frontend/activity.html?id="+encodeURIComponent(id),...eventTimes(p.date,p.end,p.time),status:"confirmed",extendedProperties:{private:{mustApp:FIREBASE_PROJECT,mustActivityId:id}}})));
}
async function calendarApi(token,url,method="GET",body,extra={}){
  const r=await fetch(url,{method,headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});
  if([404,409,410].includes(r.status))return {status:r.status};if(!r.ok)throw Error(`日曆同步失敗（${r.status}），請稍後重試或重新授權。`);
  return {status:r.status,data:r.status===204?null:await r.json()};
}
async function syncActivity(req,env){
  const {token}=await teacher(req),body=await req.json(),id=String(body.activityId||"");if(!/^[A-Za-z0-9_-]{1,200}$/.test(id))throw Error("活動 ID 不正確。");
  const selected=await env.CALENDAR_KV.get("calendar:selected","json");if(!selected?.id||selected.name!==CALENDAR_NAME)throw Error("尚未選定明新資源教室行事曆。");
  const a=await firestore("activities/"+id,token);
  if(!a&&body.action!=="delete")throw Error("活動已不存在。");
  // Always use the current source record. A stale delete request cannot erase a recreated activity.
  const desired=await desiredEvents(a,id,selected.id),google=await accessToken(env),base=`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(selected.id)}/events`;
  const existing=[];let page="";
  do{const u=new URL(base);u.searchParams.append("privateExtendedProperty","mustApp="+FIREBASE_PROJECT);u.searchParams.append("privateExtendedProperty","mustActivityId="+id);u.searchParams.set("maxResults","2500");if(page)u.searchParams.set("pageToken",page);const r=await calendarApi(google,u);if(!r.data)throw Error("無法讀取指定日曆。");existing.push(...(r.data.items||[]));page=r.data.nextPageToken||"";}while(page);
  for(const event of desired){
    const url=base+"/"+event.id,old=await calendarApi(google,url);
    if(old.data){if(old.data.extendedProperties?.private?.mustApp!==FIREBASE_PROJECT||old.data.extendedProperties?.private?.mustActivityId!==id)throw Error("日曆事件對應不符，已停止更新。");
      const {id:omit,...patch}=event;patch.start={date:null,dateTime:null,timeZone:null,...event.start};patch.end={date:null,dateTime:null,timeZone:null,...event.end};
      const result=await calendarApi(google,url+"?sendUpdates=none","PATCH",patch,old.data.etag?{"If-Match":old.data.etag}:{});if(!result.data)throw Error("日曆事件已變動，請重試。");
    }else{const r=await calendarApi(google,base+"?sendUpdates=none","POST",event);if(!r.data)throw Error("日曆事件已存在或已刪除，請重試。");}
  }
  const keep=new Set(desired.map(x=>x.id));
  for(const old of existing){if(!keep.has(old.id)&&old.extendedProperties?.private?.mustApp===FIREBASE_PROJECT&&old.extendedProperties?.private?.mustActivityId===id)await calendarApi(google,base+"/"+encodeURIComponent(old.id)+"?sendUpdates=none","DELETE",null,old.etag?{"If-Match":old.etag}:{});}
  return {ok:true,count:desired.length,calendarName:CALENDAR_NAME};
}
async function api(req,env){
  const headers={"Content-Type":"application/json","Cache-Control":"no-store","Access-Control-Allow-Origin":FRONT_ORIGIN,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Authorization, Content-Type","Vary":"Origin"};
  if(req.headers.get("Origin")!==FRONT_ORIGIN)return new Response(JSON.stringify({ok:false,error:"來源不符。"}),{status:403,headers});
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  try{if(req.method!=="POST")throw Error("請使用活動系統操作。");return new Response(JSON.stringify(await syncActivity(req,env)),{headers});}
  catch(e){return new Response(JSON.stringify({ok:false,error:e.message}),{status:400,headers});}
}

export default {
  async fetch(req,env){
    try{
      if(new URL(req.url).pathname==="/api/activity/sync")return api(req,env);
      if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET||!env.CALENDAR_KV)return html("<h1>設定尚未完成</h1><p>請確認 GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET 與 CALENDAR_KV。</p>",503);
      const u=new URL(req.url),callback=u.origin+"/oauth/callback";
      if(req.method==="GET"&&u.pathname==="/")return html(`<h1>連結資教活動日曆</h1><p>請用 ${esc(ADMIN)} 登入，選取「${CALENDAR_NAME}」。活動儲存後會同步至這份共用日曆。</p><a href="/oauth/start">連結 Google 日曆</a> <a href="/calendars">選取日曆</a>`);
      if(req.method==="GET"&&u.pathname==="/oauth/start"){
        const state=random(),verifier=random(),nonce=await sign({kind:"state",state,verifier,exp:Date.now()+600000},env);
        const g=new URL("https://accounts.google.com/o/oauth2/v2/auth");
        g.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:callback,response_type:"code",scope:"openid email https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events",access_type:"offline",prompt:"consent select_account",state,login_hint:ADMIN,code_challenge:b64(await crypto.subtle.digest("SHA-256",te.encode(verifier))),code_challenge_method:"S256"}).toString();
        return new Response(null,{status:302,headers:{Location:g.href,"Set-Cookie":setCookie("calendar_oauth",nonce,600),"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
      }
      if(req.method==="GET"&&u.pathname==="/oauth/callback"){
        const st=await verify(cookie(req,"calendar_oauth"),env);
        if(st.kind!=="state"||st.state!==u.searchParams.get("state")||!u.searchParams.get("code"))throw Error("授權取消或驗證失敗，請重新連結。");
        const t=await googleToken(env,{grant_type:"authorization_code",code:u.searchParams.get("code"),redirect_uri:callback,code_verifier:st.verifier});
        const info=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:"Bearer "+t.access_token}});
        if(!info.ok)throw Error("無法確認授權帳號。");const user=await info.json();
        if(user.email_verified!==true||String(user.email||"").toLowerCase()!==ADMIN)throw Error("請以 "+ADMIN+" 授權；其他帳號不會保存授權資料。");
        if(!t.refresh_token)throw Error("未取得長期授權，請重新連結並同意日曆權限。");
        const scopes=new Set(String(t.scope||"").split(" "));if(!scopes.has("https://www.googleapis.com/auth/calendar.events")||!scopes.has("https://www.googleapis.com/auth/calendar.calendarlist.readonly"))throw Error("未授予必要日曆權限，請重新連結。");
        await saveTokens(env,{access_token:t.access_token,refresh_token:t.refresh_token,expiresAt:Date.now()+Number(t.expires_in||3600)*1000,email:ADMIN});
        const headers=new Headers({Location:"/calendars","Cache-Control":"no-store","Referrer-Policy":"no-referrer"});headers.append("Set-Cookie",setCookie("calendar_oauth","",0));headers.append("Set-Cookie",setCookie("calendar_session",await sign({kind:"session",email:ADMIN,csrf:random(),exp:Date.now()+3600000},env),3600));
        return new Response(null,{status:303,headers});
      }
      if(req.method==="GET"&&u.pathname==="/calendars"){
        const s=await session(req,env),list=await calendars(env),selected=await env.CALENDAR_KV.get("calendar:selected","json");
        if(!list.length)return html(`<h1>找不到可編輯的資教日曆</h1><p>請確認 ${ADMIN} 已取得「${CALENDAR_NAME}」的變更活動權限，並已將它加入自己的日曆清單。</p><a href="/calendars">重新讀取</a>`);
        return html(`<h1>選取資教日曆</h1>${selected?`<p>目前指定：${esc(selected.name)}</p>`:""}<form method="post" action="/calendar/select"><input type="hidden" name="csrf" value="${esc(s.csrf)}"><select name="calendarId" required>${list.map(c=>`<option value="${esc(c.id)}">${esc(c.summaryOverride||c.summary)}（${esc(c.id)}）</option>`).join("")}</select><button>確認使用這份日曆</button></form><p>只保存同步目標，不會寫入或刪除既有活動。</p>`);
      }
      if(req.method==="POST"&&u.pathname==="/calendar/select"){
        const origin=req.headers.get("Origin");
        // no-referrer can produce an opaque Origin on this form; the signed session and CSRF token remain mandatory.
        if(origin&&origin!=="null"&&origin!==u.origin)throw Error("請從日曆設定頁操作。");
        const s=await session(req,env),f=await req.formData();if(f.get("csrf")!==s.csrf)throw Error("設定驗證失敗，請重新讀取。");
        const c=(await calendars(env)).find(c=>c.id===f.get("calendarId"));if(!c)throw Error("此日曆無可編輯權限。");
        await env.CALENDAR_KV.put("calendar:selected",JSON.stringify({id:c.id,name:c.summaryOverride||c.summary,connectedBy:ADMIN,selectedAt:new Date().toISOString()}));
        return html(`<h1>日曆連結完成</h1><p>已指定「${esc(c.summaryOverride||c.summary)}」。活動系統儲存或刪除活動後，會同步更新這份日曆。</p>`);
      }
      return html("<h1>找不到頁面</h1>",404);
    }catch(e){return html(`<h1>尚未完成連結</h1><p>${esc(e.message)}</p><a href="/">回到連結頁</a>`,400);}
  }
};
