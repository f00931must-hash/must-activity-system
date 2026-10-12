// MUST activity calendar: connection setup v1.0.0.
// Required: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CALENDAR_KV.
// This version connects and selects a calendar; it does not write events yet.
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
export default {
  async fetch(req,env){
    try{
      if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET||!env.CALENDAR_KV)return html("<h1>設定尚未完成</h1><p>請確認 GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET 與 CALENDAR_KV。</p>",503);
      const u=new URL(req.url),callback=u.origin+"/oauth/callback";
      if(req.method==="GET"&&u.pathname==="/")return html(`<h1>連結資教活動日曆</h1><p>請用 ${esc(ADMIN)} 登入，選取「${CALENDAR_NAME}」。目前只設定連結，不會新增或修改任何活動。</p><a href="/oauth/start">連結 Google 日曆</a> <a href="/calendars">選取日曆</a>`);
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
        if(req.headers.get("Origin")!==u.origin)throw Error("請從日曆設定頁操作。");
        const s=await session(req,env),f=await req.formData();if(f.get("csrf")!==s.csrf)throw Error("設定驗證失敗，請重新讀取。");
        const c=(await calendars(env)).find(c=>c.id===f.get("calendarId"));if(!c)throw Error("此日曆無可編輯權限。");
        await env.CALENDAR_KV.put("calendar:selected",JSON.stringify({id:c.id,name:c.summaryOverride||c.summary,connectedBy:ADMIN,selectedAt:new Date().toISOString()}));
        return html(`<h1>日曆連結完成</h1><p>已指定「${esc(c.summaryOverride||c.summary)}」。下一步接上活動系統的同步功能；目前尚未寫入任何活動。</p>`);
      }
      return html("<h1>找不到頁面</h1>",404);
    }catch(e){return html(`<h1>尚未完成連結</h1><p>${esc(e.message)}</p><a href="/">回到連結頁</a>`,400);}
  }
};
