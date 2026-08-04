
import { db } from "../../shared/js/firebase-app.js";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, increment, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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
    birthDate: f.birthDate === true,
    nationalId: f.nationalId === true,
    meal: activity.enableMeal !== false
  };
}

function renderHeader(){
  $("activityHeader").innerHTML = `
    <div class="status-tags"><span class="badge">${esc(activity.status || "活動")}</span>${tagHtml(activity.tags || [])}</div>
    <h1>${esc(activity.title)}</h1>
    <div class="info-line"><strong>時間</strong><span>${esc(activity.date || "")} ${esc(activity.activityTime || activity.plannedTime || activity.time || "")}</span></div>
    <div class="info-line"><strong>地點</strong><span>${esc(activity.location || "")}</span></div>
    <p class="activity-desc">${esc(activity.description || "")}</p>
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
      ${ff.phone ? `<label>聯絡電話（選填）</label><input class="field" name="phone">` : ""}
      ${ff.biologicalSex ? `<label>生理性別 *</label>
        <label class="radio-row"><input type="radio" name="biologicalSex" value="男" required> 男</label>
        <label class="radio-row"><input type="radio" name="biologicalSex" value="女"> 女</label>` : ""}
      ${ff.birthDate ? `<label>出生年月日（民國年） *</label><input class="field" name="birthDate" placeholder="例如：94/5/20" inputmode="numeric" required>` : ""}
      ${ff.nationalId ? `<label>身分證字號 *</label><input class="field" name="nationalId" placeholder="例如：A123456789" autocomplete="off" maxlength="20" required>` : ""}
      ${ff.meal ? mealHtml() : ""}
      ${sessionFieldsHtml()}
      ${(activity.registerFields || []).map(fieldHtml).join("")}
      <div id="msg"></div>
      <button class="primary-btn" type="submit">送出報名</button>
    </form>
  `;
  $("regForm").addEventListener("submit", submitForm);
}


function sessionFieldsHtml(){
  if(!activity.multiSessionEnabled || !(activity.sessions || []).length) return "";
  return `<label>可參加場次 * <span class="hint-inline">（可複選）</span></label><div class="session-choice-list">${activity.sessions.map((s,i)=>{const label=`${s.date||""} ${s.startTime||""}${s.endTime?`～${s.endTime}`:""}`.trim();return `<label class="check-row"><input type="checkbox" name="availableSessions" value="${esc(s.id||String(i))}"> ${esc(label)}</label>`}).join("")}</div>`;
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
  if(f.type === "checkbox"){
    return `<label>${esc(f.label)} ${f.required ? "*" : ""}</label>` + (f.options || []).map(o => `<label class="check-row"><input type="checkbox" name="custom_${i}" value="${esc(o)}"> ${esc(o)}</label>`).join("");
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
  (activity.registerFields || []).forEach((f,i) => customAnswers[f.label] = f.type === "checkbox" ? fd.getAll("custom_" + i) : (fd.get("custom_" + i) || ""));
  const availableSessions = fd.getAll("availableSessions");
  if(activity.multiSessionEnabled && !availableSessions.length){ $("msg").innerHTML = '<div class="error">請至少勾選一個可參加場次。</div>'; return; }

  const normalizedName = String(fd.get("name") || "").replace(/[\s　]+/g, "").trim();
  const allRegs = await getDocs(collection(db, "activities", id, "registrations"));
  const sameName = allRegs.docs.find(d => String(d.data().normalizedName || d.data().name || "").replace(/[\s　]+/g, "").trim() === normalizedName);
  if(sameName){ $("msg").innerHTML = '<div class="error">此姓名已報名過本活動。若為同名同姓，請洽活動承辦老師確認。</div>'; return; }
  const regRef = doc(db, "activities", id, "registrations", studentIdKey);
  const existing = await getDoc(regRef);
  if(existing.exists()){
    $("msg").innerHTML = '<div class="error">這個學號／職員編號已經報名過了。</div>';
    return;
  }

  try{
    const batch = writeBatch(db);
    batch.set(regRef, {
      name: fd.get("name"),
      normalizedName,
      studentId: ff.studentId ? studentIdKey : "",
      department: ff.department ? fd.get("department") : "",
      phone: ff.phone ? fd.get("phone") : "",
      biologicalSex: ff.biologicalSex ? fd.get("biologicalSex") : "",
      meal: ff.meal ? fd.get("meal") : "",
      customAnswers,
      availableSessions,
      assignedSession: "",
      createdAt: serverTimestamp()
    });
    if(ff.birthDate || ff.nationalId){
      batch.set(doc(db, "activities", id, "insurance", studentIdKey), {
        name: fd.get("name"),
        birthDate: ff.birthDate ? String(fd.get("birthDate") || "").trim() : "",
        nationalId: ff.nationalId ? String(fd.get("nationalId") || "").trim().toUpperCase() : "",
        createdAt: serverTimestamp()
      });
    }
    batch.update(doc(db, "activities", id), { registeredCount: increment(1) });
    await batch.commit();
    $("registerPanel").innerHTML = '<div class="success"><h2>報名完成！</h2><p>謝謝你的填寫。</p></div>';
  }catch(err){
    console.error(err);
    $("msg").innerHTML = `<div class="error">報名失敗：${esc(err.message)}</div>`;
  }
}

function attachmentHtml(files){
  if(!files || !files.length) return "";

  const isImage = file => {
    const type = String(file?.type || file?.mimeType || "").toLowerCase();
    const source = String(file?.name || file?.url || "").split("?")[0].toLowerCase();
    return type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(source);
  };

  const images = files.filter(isImage);
  const attachments = files.filter(file => !isImage(file));

  const posterHtml = images.length ? `
    <section class="activity-poster-section" aria-label="活動海報">
      <h2 class="activity-poster-title">活動海報</h2>
      <div class="activity-poster-grid">
        ${images.map((file, index) => `
          <a class="activity-poster-link" href="${esc(file.url || "#")}" target="_blank" rel="noopener" title="點擊查看原圖">
            <img class="activity-poster-image" src="${esc(file.url || "")}" alt="${esc(file.name || `活動海報${images.length > 1 ? index + 1 : ""}`)}" loading="lazy">
          </a>
        `).join("")}
      </div>
    </section>` : "";

  const attachmentListHtml = attachments.length ? `
    <section class="activity-file-section" aria-label="活動附件">
      <h2 class="activity-file-title">活動附件</h2>
      <div class="attachment-list compact-attachments">
        ${attachments.map((file, index) => `<a href="${esc(file.url || "#")}" target="_blank" rel="noopener">📎 ${esc(file.name || ("附件" + (attachments.length > 1 ? index + 1 : "")))}</a>`).join("")}
      </div>
    </section>` : "";

  return posterHtml + attachmentListHtml;
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
