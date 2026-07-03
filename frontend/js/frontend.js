
import { db } from "../shared/js/firebase-app.js";
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

let activities = [];

init();

async function init(){
  try{
    const q = query(collection(db, "activities"), orderBy("date", "desc"));
    const snap = await getDocs(q);
    activities = snap.docs.map(d => ({ id:d.id, ...d.data() }))
      .filter(a => a.published !== false && a.status !== "draft");
    renderActivities();
    bindEvents();
  }catch(err){
    console.error(err);
    const list = $("activityList");
    if(list) list.innerHTML = `<div class="empty">活動載入失敗：${esc(err.message)}</div>`;
  }
}

function bindEvents(){
  const searchInput = $("searchInput");
  if(searchInput) searchInput.addEventListener("input", renderActivities);

  const statusFilter = $("statusFilter");
  if(statusFilter) statusFilter.addEventListener("change", renderActivities);
}

function renderActivities(){
  const list = $("activityList");
  if(!list) return;

  const keyword = ($("searchInput")?.value || "").trim();
  const status = $("statusFilter")?.value || "";

  const filtered = activities.filter(a => {
    const text = `${a.title || ""} ${a.description || ""} ${(a.tags || []).join(" ")}`;
    const keywordOk = !keyword || text.includes(keyword);
    const statusOk = !status || a.status === status;
    return keywordOk && statusOk;
  });

  if(!filtered.length){
    list.innerHTML = '<div class="empty">目前沒有符合條件的活動。</div>';
    return;
  }

  list.innerHTML = filtered.map(activityCard).join("");
}

function activityCard(a){
  const regUrl = `activity.html?id=${encodeURIComponent(a.id)}`;
  const fbUrl = `feedback.html?id=${encodeURIComponent(a.id)}`;
  const cap = Number(a.capacity || 0);
  const reg = Number(a.registeredCount || 0);
  const capText = cap > 0 ? `${reg}/${cap}` : `${reg}/不限`;
  return `<article class="activity-card">
    <div class="activity-head">
      <div class="status-tags">
        <span class="badge">${esc(statusText(a.status))}</span>${tagHtml(a.tags || [])}
      </div>
      <h2>${esc(a.title || "未命名活動")}</h2>
    </div>
    <div class="activity-meta">
      <div><strong>日期</strong><span>${esc(a.date || "")}</span></div>
      <div><strong>時間</strong><span>${esc(a.time || "")}</span></div>
      <div><strong>地點</strong><span>${esc(a.location || "")}</span></div>
      <div><strong>報名</strong><span>${capText}</span></div>
    </div>
    ${a.description ? `<p class="activity-desc">${esc(a.description)}</p>` : ""}
    ${attachmentHtml(a.attachments || [])}
    <div class="activity-actions">
      <a class="primary-btn" href="${regUrl}">我要報名</a>
      <a class="ghost-btn" href="${fbUrl}">填寫回饋</a>
    </div>
  </article>`;
}

function attachmentHtml(files){
  if(!files || !files.length) return "";
  return `<div class="attachment-list">${files.map(f => `<a href="${esc(f.url || "#")}" target="_blank" rel="noopener">📎 ${esc(f.name || "附件")}</a>`).join("")}</div>`;
}

function statusText(status){
  return {open:"報名中",feedback:"回饋中",closed:"已結束",draft:"草稿"}[status] || status || "活動";
}

function tagColorClass(tag){
  const classes = ["tag-blue","tag-green","tag-yellow","tag-purple","tag-rose","tag-orange"];
  let sum = 0;
  String(tag || "").split("").forEach(ch => sum += ch.charCodeAt(0));
  return classes[sum % classes.length];
}

function tagHtml(tags){
  const uniqueTags = [...new Set((tags || []).filter(Boolean))];
  if(!uniqueTags.length) return "";
  return `<div class="tag-row">${uniqueTags.map(t => `<span class="tag ${tagColorClass(t)}">${esc(t)}</span>`).join("")}</div>`;
}

function esc(str){
  return String(str || "").replace(/[&<>"']/g, m => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[m]));
}
