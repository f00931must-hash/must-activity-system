import { db } from "../shared/js/firebase-app.js";
import { collection, doc, getDoc, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
const $ = id => document.getElementById(id);
let activities=[];
init();
async function init(){
 try{
  const snap=await getDocs(query(collection(db,"activities"),orderBy("date","asc")));
  activities=snap.docs.map(d=>({id:d.id,...d.data()})).filter(a=>a.published!==false&&a.status!=="draft");
  buildSemesterFilter(); bindEvents(); renderActivities();
 }catch(err){ console.error(err); $("activityList").innerHTML=`<div class="empty">活動載入失敗：${esc(err.message)}</div>`; }
}
function buildSemesterFilter(){
 const el=$("semesterFilter"); if(!el)return;
 const terms=[...new Set(activities.map(a=>a.academicYear&&a.semester?`${a.academicYear}-${a.semester}`:"").filter(Boolean))].sort().reverse();
 el.innerHTML='<option value="">全部學期</option>'+terms.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join("");
}
function bindEvents(){
 ["statusFilter","semesterFilter"].forEach(id=>$(id)?.addEventListener("change",renderActivities));
 $("registrationLookupBtn")?.addEventListener("click",lookupRegistrations);
 $("registrationLookupId")?.addEventListener("keydown",event=>{if(event.key==="Enter")lookupRegistrations();});
}
function effectiveStatus(a){
 const text=activityStatusText(a);
 if(text==="報名中")return"open";
 if(text==="回饋中")return"feedback";
 if(["報名已截止","已額滿","已結束"].includes(text))return"closed";
 return text==="尚未開放"?"upcoming":(a.status||"");
}
function renderActivities(){
 const st=$("statusFilter")?.value||"",term=$("semesterFilter")?.value||"";
 const rows=activities.filter(a=>(!st||effectiveStatus(a)===st)&&(!term||`${a.academicYear||""}-${a.semester||""}`===term));
 $("activityList").innerHTML=rows.length?rows.map(activityCard).join(""):'<div class="empty">目前沒有符合條件的活動。</div>';
}
async function lookupRegistrations(){
 const input=$("registrationLookupId"),result=$("registrationLookupResult"),button=$("registrationLookupBtn");
 if(!input||!result)return;
 const studentId=String(input.value||"").trim().toUpperCase();
 if(!studentId){result.classList.remove("hidden");result.innerHTML='<div class="lookup-message">請輸入學號／職員編號。</div>';input.focus();return;}
 const original=button?.textContent||"查詢報名";
 if(button){button.disabled=true;button.textContent="查詢中…";}
 result.classList.remove("hidden");
 result.innerHTML='<div class="lookup-message">正在查詢你的報名紀錄…</div>';
 try{
   const checks=await Promise.all(activities.map(async activity=>{
     try{
       const snap=await getDoc(doc(db,"activities",activity.id,"registrations",studentId));
       return snap.exists()?{activity,registration:snap.data()}:null;
     }catch{return null;}
   }));
   const found=checks.filter(Boolean).sort((a,b)=>String(b.activity.date||"").localeCompare(String(a.activity.date||"")));
   if(!found.length){
     result.innerHTML='<div class="lookup-message">目前查不到這個學號的報名紀錄。</div>';
     return;
   }
   result.innerHTML=`<div class="lookup-result-head"><strong>已報名 ${found.length} 個活動</strong><button type="button" class="lookup-close" aria-label="關閉">×</button></div>
     <div class="lookup-activity-list">${found.map(({activity,registration})=>`
       <a class="lookup-activity-item" href="activity.html?id=${encodeURIComponent(activity.id)}">
         <div><strong>${esc(activity.title||"未命名活動")}</strong><span>${esc(activityDateText(activity))}　${esc(activity.activityTime||activity.plannedTime||activity.time||"")}</span>${registration.availableSessions?.length?'<small>已選擇多場次報名</small>':""}</div>
         <span class="lookup-arrow">›</span>
       </a>`).join("")}</div>`;
   result.querySelector(".lookup-close")?.addEventListener("click",()=>result.classList.add("hidden"));
 }catch(err){
   console.error(err);
   result.innerHTML='<div class="lookup-message">查詢失敗，請稍後再試。</div>';
 }finally{
   if(button){button.disabled=false;button.textContent=original;}
 }
}

function sessionSummary(a){
 if(!a.multiSessionEnabled||!(a.sessions||[]).length)return "";
 return `<div class="session-summary"><strong>可報名場次</strong>${a.sessions.map(s=>`<span>${esc(s.date||"")} ${esc(s.startTime||"")}${s.endTime?`～${esc(s.endTime)}`:""}${s.location?`｜地點：${esc(s.location)}`:""}</span>`).join("")}</div>`;
}
function activityCard(a){
 const cap=Number(a.capacity||0),reg=Number(a.registeredCount||0),capText=cap>0?`${reg}/${cap}`:`${reg}/不限`;
 const term=a.academicYear&&a.semester?`${a.academicYear}-${a.semester}`:"未設定學期";
 return `<article class="activity-card"><div class="activity-head"><div class="status-tags"><span class="badge">${esc(activityStatusText(a))}</span>${tagHtml([a.certificationTag,...(a.tags||[])].filter(Boolean))}</div><div class="term-badge">${esc(term)}</div><h2>${esc(a.title||"未命名活動")}</h2></div><div class="activity-meta"><div><strong>日期</strong><span>${esc(activityDateText(a))}</span></div><div><strong>活動時間</strong><span>${esc(a.activityTime||a.plannedTime||a.time||"")}</span></div><div><strong>地點</strong><span>${esc(a.location||"")}</span></div><div><strong>報名</strong><span>${capText}</span></div></div>${sessionSummary(a)}${a.description?`<p class="activity-desc">${esc(a.description)}</p>`:""}${attachmentHtml(a.attachments||[])}<div class="activity-actions"><a class="primary-btn" href="activity.html?id=${encodeURIComponent(a.id)}">我要報名</a><a class="ghost-btn" href="feedback.html?id=${encodeURIComponent(a.id)}">填寫回饋</a></div></article>`;
}
function attachmentHtml(files){return files?.length?`<div class="attachment-list compact-attachments">${files.map((f,i)=>`<a href="${esc(f.url||"#")}" target="_blank" rel="noopener">📎 附件${files.length>1?i+1:""}</a>`).join("")}</div>`:""}
function activityDateText(a){const start=String(a?.date||"");return a?.dateMode==="multi"&&a?.endDate?`${start}～${a.endDate}`:start}
function activityStatusText(a){
 if(a.status!=="open")return{feedback:"回饋中",closed:"已結束",draft:"草稿"}[a.status]||a.status||"活動";
 const now=Date.now(),openAt=parseLocalTime(a.registerOpenAt),closeAt=parseLocalTime(a.registerCloseAt);
 if(openAt&&now<openAt)return"尚未開放";
 if(closeAt&&now>closeAt)return"報名已截止";
 const cap=Number(a.capacity||0),reg=Number(a.registeredCount||0);
 if(cap>0&&reg>=cap)return"已額滿";
 return"報名中";
}
function parseLocalTime(value){
 if(!value)return null;
 const t=new Date(value).getTime();
 return Number.isNaN(t)?null:t;
}
function tagColorClass(tag){const c=["tag-blue","tag-green","tag-yellow","tag-purple","tag-rose","tag-orange"];let n=0;String(tag||"").split("").forEach(x=>n+=x.charCodeAt(0));return c[n%c.length]}
function tagHtml(tags){const u=[...new Set((tags||[]).filter(Boolean))];return u.length?`<div class="tag-row">${u.map(t=>`<span class="tag ${tagColorClass(t)}">${esc(t)}</span>`).join("")}</div>`:""}
function esc(v){return String(v||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
