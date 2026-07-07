
import { db } from "../../shared/js/firebase-app.js";
import { doc, getDoc, setDoc, updateDoc, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = id => document.getElementById(id);
const id = new URLSearchParams(location.search).get("id");
let activity = null;

init();

async function init(){
  const snap = await getDoc(doc(db, "activities", id));
  if(!snap.exists()){
    $("activityHeader").innerHTML = '<div class="empty">找不到活動</div>';
    return;
  }
  activity = { id: snap.id, ...snap.data() };
  renderHeader();
  renderForm();
}

function fixedFields(){
  const f = activity.fixedFields || {};
  return {
    studentId: f.studentId !== false,
    department: f.department !== false,
    phone: f.phone !== false,
    biologicalSex: f.biologicalSex !== false,
    meal: activity.enableMeal !== false
  };
}

function renderHeader(){
  $("activityHeader").innerHTML = `
    <div class="status-tags"><span class="badge">${esc(activity.status || "活動")}</span>${tagHtml(activity.tags || [])}</div>
    <h1>${esc(activity.title)}</h1>
    <div class="info-line"><strong>時間</strong><span>${esc(activity.date || "")} ${esc(activity.time || "")}</span></div>
    <div class="info-line"><strong>地點</strong><span>${esc(activity.location || "")}</span></div>
    <p>${esc(activity.description || "")}</p>
    ${attachmentHtml(activity.attachments || [])}
  `;
}

function renderForm(){
  const cap = Number(activity.capacity || 0);
  const reg = Number(activity.registeredCount || 0);
  const openAt = parseLocalTime(activity.registerOpenAt);
  const closeAt = parseLocalTime(activity.registerCloseAt);
  const now = Date.now();

  if(activity.status !== "open"){
    $("registerPanel").innerHTML = '<div class="empty">目前未開放報名。</div>';
    return;
  }
  if(openAt && now < openAt){
    $("registerPanel").innerHTML = '<div class="empty">報名尚未開始。</div>';
    return;
  }
  if(closeAt && now > closeAt){
    $("registerPanel").innerHTML = '<div class="empty">報名已截止。</div>';
    return;
  }
  if(cap > 0 && reg >= cap){
    $("registerPanel").innerHTML = '<div class="empty">本活動已額滿。</div>';
    return;
  }

  const ff = fixedFields();
  $("registerPanel").innerHTML = `
    <h2>我要報名</h2>
    <form id="regForm">
      <label>姓名 *</label><input class="field" name="name" required>
      ${ff.studentId ? `<label>學號／職員編號 *</label><input class="field" name="studentId" required>` : ""}
      ${ff.department ? `<label>單位／班級 <span class="hint-inline">（例如：旅廚二甲、資源教室）</span> *</label><input class="field" name="department" required>` : ""}
      ${ff.phone ? `<label>聯絡電話 *</label><input class="field" name="phone" required>` : ""}
      ${ff.biologicalSex ? `<label>生理性別 *</label>
        <label class="radio-row"><input type="radio" name="biologicalSex" value="男" required> 男</label>
        <label class="radio-row"><input type="radio" name="biologicalSex" value="女"> 女</label>` : ""}
      ${ff.meal ? mealHtml() : ""}
      ${(activity.registerFields || []).map(fieldHtml).join("")}
      <div id="msg"></div>
      <button class="primary-btn" type="submit">送出報名</button>
    </form>
  `;
  $("regForm").addEventListener("submit", submitForm);
}

function mealHtml(){
  const opts = (activity.mealOptions && activity.mealOptions.length) ? activity.mealOptions : ["葷","素","不用餐"];
  const normalized = opts.map(o => typeof o === "string" ? {label:o, imageUrl:""} : {label:o.label || "", imageUrl:o.imageUrl || ""}).filter(o => o.label);
  const hasImages = normalized.some(o => o.imageUrl);
  if(hasImages){
    return `<label>餐點 *</label><div class="image-choice-grid meal-choice-grid">` + normalized.map((o,i)=>`
      <label class="image-choice-card">
        <input type="radio" name="meal" value="${esc(o.label)}" ${i===0 ? "required" : ""}>
        ${o.imageUrl ? `<img src="${esc(o.imageUrl)}" alt="${esc(o.label)}">` : ""}
        <span>${esc(o.label)}</span>
      </label>`).join("") + `</div>`;
  }
  return `<label>餐點 *</label>` + normalized.map((o,i)=>`<label class="radio-row"><input type="radio" name="meal" value="${esc(o.label)}" ${i===0 ? "required" : ""}> ${esc(o.label)}</label>`).join("");
}

function fieldHtml(f, i){
  const req = f.required ? "required" : "";
  if(f.type === "imageRadio"){
    return `<label>${esc(f.label)} ${f.required ? "*" : ""}</label>
      <div class="image-choice-grid">
        ${(f.imageOptions || []).filter(o => o.label).map(o => `
          <label class="image-choice-card">
            <input type="radio" name="custom_${i}" value="${esc(o.label)}" ${req}>
            ${o.imageUrl ? `<img src="${esc(o.imageUrl)}" alt="${esc(o.label)}">` : ""}
            <span>${esc(o.label)}</span>
          </label>`).join("")}
      </div>`;
  }
  if(f.type === "radio"){
    return `<label>${esc(f.label)} ${f.required ? "*" : ""}</label>` +
      (f.options || []).map(o => `<label class="radio-row"><input type="radio" name="custom_${i}" value="${esc(o)}" ${req}> ${esc(o)}</label>`).join("");
  }
  if(f.type === "textarea"){
    return `<label>${esc(f.label)} ${f.required ? "*" : ""}</label><textarea class="field" name="custom_${i}" ${req}></textarea>`;
  }
  return `<label>${esc(f.label)} ${f.required ? "*" : ""}</label><input class="field" name="custom_${i}" ${req}>`;
}

async function submitForm(e){
  e.preventDefault();
  const fd = new FormData(e.target);
  const ff = fixedFields();
  const studentIdKey = ff.studentId ? String(fd.get("studentId") || "").trim().toUpperCase() : ("NOID_" + Date.now());
  if(ff.studentId && !studentIdKey){
    $("msg").innerHTML = '<div class="error">請填寫學號／職員編號。</div>';
    return;
  }

  const customAnswers = {};
  (activity.registerFields || []).forEach((f,i) => customAnswers[f.label] = fd.get("custom_" + i) || "");

  const regRef = doc(db, "activities", id, "registrations", studentIdKey);
  const existing = await getDoc(regRef);
  if(existing.exists()){
    $("msg").innerHTML = '<div class="error">這個學號／職員編號已經報名過了。</div>';
    return;
  }

  try{
    await setDoc(regRef, {
      name: fd.get("name"),
      studentId: ff.studentId ? studentIdKey : "",
      department: ff.department ? fd.get("department") : "",
      phone: ff.phone ? fd.get("phone") : "",
      biologicalSex: ff.biologicalSex ? fd.get("biologicalSex") : "",
      meal: ff.meal ? fd.get("meal") : "",
      customAnswers,
      createdAt: serverTimestamp()
    });
    await updateDoc(doc(db, "activities", id), { registeredCount: increment(1) });
    $("registerPanel").innerHTML = '<div class="success"><h2>報名完成！</h2><p>謝謝你的填寫。</p></div>';
  }catch(err){
    console.error(err);
    $("msg").innerHTML = `<div class="error">報名失敗：${esc(err.message)}</div>`;
  }
}

function attachmentHtml(files){
  if(!files || !files.length) return "";
  return `<div class="attachment-list compact-attachments">
    ${files.map((f,i) => `<a href="${esc(f.url || "#")}" target="_blank" rel="noopener">📎 ${esc(f.name || ("附件" + (files.length > 1 ? i+1 : "")))}</a>`).join("")}
  </div>`;
}

function parseLocalTime(value){
  if(!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
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
  return String(str || "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}
