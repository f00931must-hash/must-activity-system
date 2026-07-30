import { db } from "../shared/js/firebase-app.js";
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
const $ = id => document.getElementById(id);
let activities=[];
init();
async function init(){
 try{
  const snap=await getDocs(query(collection(db,"activities"),orderBy("date","desc")));
  activities=snap.docs.map(d=>({id:d.id,...d.data()})).filter(a=>a.published!==false&&a.status!=="draft");
  buildSemesterFilter(); bindEvents(); renderActivities();
 }catch(err){ console.error(err); $("activityList").innerHTML=`<div class="empty">活動載入失敗：${esc(err.message)}</div>`; }
}
function buildSemesterFilter(){
 const el=$("semesterFilter"); if(!el)return;
 const terms=[...new Set(activities.map(a=>a.academicYear&&a.semester?`${a.academicYear}-${a.semester}`:"").filter(Boolean))].sort().reverse();
 el.innerHTML='<option value="">全部學期</option>'+terms.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join("");
}
function bindEvents(){ ["searchInput","statusFilter","semesterFilter"].forEach(id=>$(id)?.addEventListener(id==="searchInput"?"input":"change",renderActivities)); }
function renderActivities(){
 const kw=($("searchInput")?.value||"").trim(); const st=$("statusFilter")?.value||""; const term=$("semesterFilter")?.value||"";
 const rows=activities.filter(a=>{const text=`${a.title||""} ${a.description||""} ${a.certificationTag||""} ${(a.tags||[]).join(" ")}`;return(!kw||text.includes(kw))&&(!st||a.status===st)&&(!term||`${a.academicYear||""}-${a.semester||""}`===term)});
 $("activityList").innerHTML=rows.length?rows.map(activityCard).join(""):'<div class="empty">目前沒有符合條件的活動。</div>';
}
function sessionSummary(a){
 if(!a.multiSessionEnabled||!(a.sessions||[]).length)return "";
 return `<div class="session-summary"><strong>可報名場次</strong>${a.sessions.map(s=>`<span>${esc(s.date||"")} ${esc(s.startTime||"")}${s.endTime?`～${esc(s.endTime)}`:""}</span>`).join("")}</div>`;
}
function activityCard(a){
 const cap=Number(a.capacity||0),reg=Number(a.registeredCount||0),capText=cap>0?`${reg}/${cap}`:`${reg}/不限`;
 const term=a.academicYear&&a.semester?`${a.academicYear}-${a.semester}`:"未設定學期";
 return `<article class="activity-card"><div class="activity-head"><div class="status-tags"><span class="badge">${esc(statusText(a.status))}</span>${tagHtml([a.certificationTag,...(a.tags||[])].filter(Boolean))}</div><div class="term-badge">${esc(term)}</div><h2>${esc(a.title||"未命名活動")}</h2></div><div class="activity-meta"><div><strong>日期</strong><span>${esc(a.date||"")}</span></div><div><strong>活動時間</strong><span>${esc(a.activityTime||a.plannedTime||a.time||"")}</span></div><div><strong>地點</strong><span>${esc(a.location||"")}</span></div><div><strong>報名</strong><span>${capText}</span></div></div>${sessionSummary(a)}${a.description?`<p class="activity-desc">${esc(a.description)}</p>`:""}${attachmentHtml(a.attachments||[])}<div class="activity-actions"><a class="primary-btn" href="activity.html?id=${encodeURIComponent(a.id)}">我要報名</a><a class="ghost-btn" href="feedback.html?id=${encodeURIComponent(a.id)}">填寫回饋</a></div></article>`;
}
function attachmentHtml(files){return files?.length?`<div class="attachment-list compact-attachments">${files.map((f,i)=>`<a href="${esc(f.url||"#")}" target="_blank" rel="noopener">📎 附件${files.length>1?i+1:""}</a>`).join("")}</div>`:""}
function statusText(s){return{open:"報名中",feedback:"回饋中",closed:"已結束",draft:"草稿"}[s]||s||"活動"}
function tagColorClass(tag){const c=["tag-blue","tag-green","tag-yellow","tag-purple","tag-rose","tag-orange"];let n=0;String(tag||"").split("").forEach(x=>n+=x.charCodeAt(0));return c[n%c.length]}
function tagHtml(tags){const u=[...new Set((tags||[]).filter(Boolean))];return u.length?`<div class="tag-row">${u.map(t=>`<span class="tag ${tagColorClass(t)}">${esc(t)}</span>`).join("")}</div>`:""}
function esc(v){return String(v||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
