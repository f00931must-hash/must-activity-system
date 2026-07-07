
import { db, auth } from "../../shared/js/firebase-app.js";
import { builtInAdmins, siteConfig } from "../../shared/js/firebase-config.js";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, getDocs, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const provider = new GoogleAuthProvider();

let activities = [];
let adminEmails = [];
let systemTags = [];
let currentUser = null;
let regFields = [];
let fbQuestions = [];
let feedbackTextQuestions = [];
let attachments = [];
let mealOptions = ["葷","素","不用餐"];
let adminSearchText = "";
let latestStatsRows = [];
let latestFileRows = [];
let unsubscribe = null;

const defaultFb = [];

const likertOptions = ["非常滿意","滿意","普通","不滿意","非常不滿意"];

function val(id){ return $(id)?.value ?? ""; }
function checked(id){ return !!$(id)?.checked; }
function setVal(id, value){ const el=$(id); if(el) el.value=value ?? ""; }
function setChecked(id, value){ const el=$(id); if(el) el.checked=!!value; }
function setText(id, value){ const el=$(id); if(el) el.textContent=value ?? ""; }
function setHtml(id, value){ const el=$(id); if(el) el.innerHTML=value ?? ""; }

function cleanUndefined(obj){
  if(Array.isArray(obj)) return obj.map(cleanUndefined);
  if(obj && typeof obj === "object"){
    const out = {};
    Object.entries(obj).forEach(([k,v]) => {
      if(v !== undefined) out[k] = cleanUndefined(v);
    });
    return out;
  }
  return obj;
}

function isAdmin(email){ return adminEmails.includes(email); }

async function loadAdmins(){
  const ref = doc(db, "settings", "admins");
  const snap = await getDoc(ref);
  adminEmails = snap.exists() ? (snap.data().emails || []) : [];
  for(const email of builtInAdmins){
    if(!adminEmails.includes(email)) adminEmails.push(email);
  }
  if(currentUser && builtInAdmins.includes(currentUser.email)){
    await setDoc(ref, {emails: adminEmails, updatedAt: serverTimestamp()}, {merge:true});
  }
  renderAdmins();
}

function renderAdmins(){
  const box = $("adminEmailList");
  if(!box) return;
  box.innerHTML = adminEmails.map(email => `
    <div class="admin-email-item">
      <strong>${esc(email)}</strong>
      ${builtInAdmins.includes(email) ? "<span>內建</span>" : `<button class="ghost-btn" data-remove-admin="${esc(email)}">移除</button>`}
    </div>
  `).join("");
}

function showView(view){
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  $("view-" + view)?.classList.remove("hidden");
  if(view === "files") setTimeout(refreshFiles, 50);
  setText("pageTitle", {dashboard:"儀表板",activities:"活動管理",students:"學生查詢",stats:"統計分析",files:"檔案管理",settings:"系統設定"}[view] || "管理平台");
}

function closeModal(){
  $("modal")?.classList.add("hidden");
}

function listenActivities(){
  if(unsubscribe) return;
  unsubscribe = onSnapshot(query(collection(db, "activities"), orderBy("date", "desc")), snap => {
    activities = snap.docs.map(d => ({id:d.id, ...d.data()}));
    updateStats();
    renderLists();
  }, err => console.error(err));
}

function updateStats(){
  setText("statActivities", activities.length);
  setText("statRegs", activities.reduce((s,a)=>s+Number(a.registeredCount||0),0));
  setText("statFeedbacks", activities.reduce((s,a)=>s+Number(a.feedbackCount||0),0));
  setText("statOpenActivities", activities.filter(a=>a.status==="open").length);
}

function renderLists(){
  const data=activities.filter(a=>!adminSearchText || (a.title||"").includes(adminSearchText) || (a.tags||[]).join(",").includes(adminSearchText));
  const html=data.length ? data.map(card).join("") : '<div class="empty">目前沒有活動</div>';
  setHtml("activityList", html); setHtml("activityList2", html);
}

function card(a){
  const regUrl = siteConfig.baseUrl + "frontend/activity.html?id=" + a.id;
  const fbUrl = siteConfig.baseUrl + "frontend/feedback.html?id=" + a.id;
  const capText = Number(a.capacity || 0) > 0 ? `${a.registeredCount||0}/${a.capacity}` : `${a.registeredCount||0}/不限`;
  const sem = a.academicYear && a.semester ? `${a.academicYear}學年度第${a.semester}學期` : "未設定";
  return `<article class="activity-admin-card">
    <div class="activity-card-main">
      <div class="activity-title-row"><h3>${esc(a.title)}</h3><div class="status-tags"><span class="badge">${statusText(a.status)}</span>${tagHtml(a.tags || [])}</div></div>
      <div class="activity-info-grid">
        <div><strong>學期</strong><span>${esc(sem)}</span></div>
        <div><strong>日期</strong><span>📅 ${esc(a.date||"")}</span></div>
        <div><strong>時間</strong><span>${esc(a.time||"")}</span></div>
        <div><strong>地點</strong><span>📍 ${esc(a.location||"")}</span></div>
        <div><strong>報名</strong><span>${capText}</span></div>
        <div><strong>回饋</strong><span>${a.feedbackCount||0} 份</span></div>
      </div>
      ${a.description ? `<p class="activity-desc">${esc(a.description)}</p>` : ""}
    </div>
    <div class="activity-actions">
      <button class="ghost-btn" data-copy="${regUrl}">複製報名連結</button>
      <button class="ghost-btn" data-qrprint="${regUrl}" data-title="${esc(a.title)} 報名 QR">下載報名QR A4</button>
      <button class="ghost-btn" data-copy="${fbUrl}">複製回饋連結</button>
      <button class="ghost-btn" data-qrprint="${fbUrl}" data-title="${esc(a.title)} 回饋 QR">下載回饋QR A4</button>
      <button class="ghost-btn" data-view-regs="${a.id}">查看報名名單</button>
      <button class="ghost-btn" data-view-fbs="${a.id}">查看回饋資料</button>
      <button class="ghost-btn" data-export-word="${a.id}">下載成果Word</button>
      <button class="ghost-btn" data-copy-activity="${a.id}">複製活動</button>
      <button class="ghost-btn" data-edit="${a.id}">修改</button>
      <button class="ghost-btn danger-btn" data-delete="${a.id}">刪除</button>
    </div>
  </article>`;
}

function resetForm(){
  setVal("editId", "");
  setText("formTitle", "新增活動");
  setVal("academicYear", "");
  setVal("semester", "");
  setVal("title", "");
  const dateEl = $("date");
  if(dateEl) dateEl.valueAsDate = new Date();
  setVal("time", "");
  setVal("location", "");
  setVal("description", "");
  setVal("capacity", 0);
  setVal("status", "open");
  setChecked("published", true);
  setChecked("showStudentId", true);
  setChecked("showDepartment", true);
  setChecked("showPhone", true);
  setChecked("showBiologicalSex", true);
  setChecked("enableMeal", true);
  mealOptions = ["葷","素","不用餐"];
  renderMealOptions();
  setVal("registerOpenAt", "");
  setVal("registerCloseAt", "");
  setVal("feedbackOpenAt", "");
  setVal("feedbackCloseAt", "");
  setVal("feedbackMinWords", 30);
  regFields = [];
  fbQuestions = [...defaultFb];
  feedbackTextQuestions = [];
  attachments = [];
  renderAttachments();
  renderRegFields();
  renderFbQuestions();
  renderFeedbackTextQuestions();
}

function editActivity(id){
  const a = activities.find(x => x.id === id);
  if(!a) return;
  showView("activities");
  setVal("editId", id);
  setText("formTitle", "修改活動");
  setVal("academicYear", a.academicYear || "");
  setVal("semester", a.semester || "");
  setVal("title", a.title || "");
  setVal("date", a.date || "");
  setVal("time", a.time || "");
  setVal("location", a.location || "");
  setVal("description", a.description || "");
  setVal("capacity", a.capacity || 0);
  setVal("status", a.status || "open");
  setChecked("published", a.published !== false);
  const fixed = a.fixedFields || {};
  setChecked("showStudentId", fixed.studentId !== false);
  setChecked("showDepartment", fixed.department !== false);
  setChecked("showPhone", fixed.phone !== false);
  setChecked("showBiologicalSex", fixed.biologicalSex !== false);
  setChecked("enableMeal", a.enableMeal !== false);
  mealOptions = a.mealOptions || ["葷","素","不用餐"];
  renderMealOptions();
  setVal("registerOpenAt", a.registerOpenAt || "");
  setVal("registerCloseAt", a.registerCloseAt || "");
  setVal("feedbackOpenAt", a.feedbackOpenAt || "");
  setVal("feedbackCloseAt", a.feedbackCloseAt || "");
  setVal("feedbackMinWords", a.feedbackMinWords || 30);
  regFields = a.registerFields || [];
  fbQuestions = a.feedbackQuestions || [...defaultFb];
  feedbackTextQuestions = a.feedbackTextQuestions || [];
  attachments = a.attachments || [];
  renderAttachments();
  renderRegFields();
  renderFbQuestions();
  renderFeedbackTextQuestions();
}

function copyActivity(id){
  const a = activities.find(x => x.id === id);
  if(!a) return;
  showView("activities");
  setVal("editId", "");
  setText("formTitle", "複製活動（請確認日期後儲存）");
  setVal("academicYear", a.academicYear || "");
  setVal("semester", a.semester || "");
  setVal("title", (a.title || "") + "（複製）");
  setVal("date", a.date || "");
  setVal("time", a.time || "");
  setVal("location", a.location || "");
  setVal("description", a.description || "");
  setVal("capacity", a.capacity || 0);
  setVal("status", "draft");
  setChecked("published", false);
  const copyFixed = a.fixedFields || {};
  setChecked("showStudentId", copyFixed.studentId !== false);
  setChecked("showDepartment", copyFixed.department !== false);
  setChecked("showPhone", copyFixed.phone !== false);
  setChecked("showBiologicalSex", copyFixed.biologicalSex !== false);
  setChecked("enableMeal", a.enableMeal !== false);
  mealOptions = a.mealOptions || ["葷","素","不用餐"];
  renderMealOptions();
  setVal("registerOpenAt", a.registerOpenAt || "");
  setVal("registerCloseAt", a.registerCloseAt || "");
  setVal("feedbackOpenAt", a.feedbackOpenAt || "");
  setVal("feedbackCloseAt", a.feedbackCloseAt || "");
  setVal("feedbackMinWords", a.feedbackMinWords || 30);
  regFields = JSON.parse(JSON.stringify(a.registerFields || []));
  fbQuestions = [...(a.feedbackQuestions || [])];
  feedbackTextQuestions = [...(a.feedbackTextQuestions || [])];
  attachments = JSON.parse(JSON.stringify(a.attachments || []));
  renderAttachments(); renderRegFields(); renderFbQuestions(); renderFeedbackTextQuestions();
}

function renderMealOptions(){
  const box = $("mealOptionsBox");
  if(!box) return;
  box.innerHTML = mealOptions.length ? mealOptions.map((m,i)=>`
    <div class="field-row meal-option-row">
      <input class="field meal-option-input" data-i="${i}" value="${esc(m)}" placeholder="例如：雞腿、素食、不用餐">
      <button type="button" class="ghost-btn danger-btn meal-option-remove" data-i="${i}">移除</button>
    </div>`).join("") : '<div class="empty">目前沒有餐點選項。</div>';
  bindFieldEvents();
}

function renderAttachments(){
  const html = attachments.length ? attachments.map((f,i)=>`
    <div class="field-item attachment-item">
      <div class="attach-row">
        <input class="field att-name" data-i="${i}" value="${esc(f.name || "")}" placeholder="附件名稱，例如 行程表">
        <input class="field att-url" data-i="${i}" value="${esc(f.url || "")}" placeholder="附件網址">
        <a class="ghost-btn" href="${esc(f.url || "#")}" target="_blank" rel="noopener">開啟</a>
        <button type="button" class="ghost-btn att-remove" data-i="${i}">移除</button>
      </div>
      ${f.type && f.type.startsWith("image/") ? `<img class="attachment-preview" src="${esc(f.url)}" alt="${esc(f.name || "附件圖片")}">` : ""}
    </div>`).join("") : '<div class="empty">目前沒有附件。</div>';
  setHtml("attachmentsBox", html);
  bindFieldEvents();
}
function githubRepoInfo(){
  // 依目前專案固定：f00931must-hash / must-activity-system
  return {
    owner: "f00931must-hash",
    repo: "must-activity-system",
    branch: "main",
    folder: "uploads/activity-attachments"
  };
}

function getGithubToken(){
  return localStorage.getItem("must_activity_github_token") || "";
}

function setGithubToken(token){
  localStorage.setItem("must_activity_github_token", token || "");
  renderGithubTokenStatus();
}

function renderGithubTokenStatus(){
  const el = $("githubTokenStatus");
  if(!el) return;
  el.textContent = getGithubToken() ? "已設定 Token，可上傳附件。" : "尚未設定 Token。";
}

function arrayBufferToBase64(buffer){
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for(let i=0; i<bytes.length; i+=chunkSize){
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i+chunkSize));
  }
  return btoa(binary);
}

async function uploadFileToGithub(file, folder="activity-attachments"){
  const token = getGithubToken();
  if(!token){
    throw new Error("尚未設定 GitHub Token，請先到系統設定貼上 Token。");
  }
  const info = githubRepoInfo();
  const safeName = file.name.replace(/[^\u4e00-\u9fa5a-zA-Z0-9._-]/g, "_");
  const path = `uploads/${folder}/${Date.now()}_${safeName}`;
  const content = arrayBufferToBase64(await file.arrayBuffer());

  const res = await fetch(`https://api.github.com/repos/${info.owner}/${info.repo}/contents/${encodeURIComponent(path).replace(/%2F/g,"/")}`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: `upload file: ${safeName}`,
      content,
      branch: info.branch
    })
  });

  if(!res.ok){
    const err = await res.json().catch(()=>({message:res.statusText}));
    throw new Error(err.message || "GitHub upload failed");
  }
  return { name:file.name, url:`${siteConfig.baseUrl}${path}`, type:file.type || "", path };
}

async function uploadAttachment(){
  const fileInput = $("attachmentFile");
  const file = fileInput?.files?.[0];
  if(!file){
    alert("請先選擇圖片或 PDF 檔案。");
    return;
  }

  const allowed = file.type.startsWith("image/") || file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".doc") || file.name.toLowerCase().endsWith(".docx") ||
    file.name.toLowerCase().endsWith(".ppt") || file.name.toLowerCase().endsWith(".pptx");
  if(!allowed){
    alert("目前建議上傳圖片、PDF、Word 或 PPT 檔。");
    return;
  }

  if(file.size > 20 * 1024 * 1024){
    alert("檔案太大，建議 20MB 以下。");
    return;
  }

  try{
    const uploaded = await uploadFileToGithub(file, "activity-attachments");
    attachments.push(uploaded);
    fileInput.value = "";
    renderAttachments();
    alert("附件已上傳到 GitHub。");
  }catch(err){
    console.error(err);
    if(String(err.message).includes("Token")) showView("settings");
    alert("附件上傳失敗：" + err.message);
  }
}

function renderRegFields(){
  const html = regFields.length ? regFields.map((f,i)=>`
    <div class="field-item">
      <div class="field-row">
        <input class="field reg-label" data-i="${i}" value="${esc(f.label)}">
        <select class="field reg-type" data-i="${i}">
          <option value="text" ${f.type==="text"?"selected":""}>簡答</option>
          <option value="textarea" ${f.type==="textarea"?"selected":""}>段落</option>
          <option value="radio" ${f.type==="radio"?"selected":""}>單選</option>
          <option value="imageRadio" ${f.type==="imageRadio"?"selected":""}>圖片單選</option>
        </select>
        <button type="button" class="ghost-btn reg-remove" data-i="${i}">移除</button>
      </div>
      <label><input type="checkbox" class="reg-required" data-i="${i}" ${f.required?"checked":""}> 必填</label>
      ${f.type === "imageRadio" ? imageOptionEditor(f,i) : `<input class="field reg-options" data-i="${i}" value="${esc((f.options||[]).join(','))}" placeholder="單選選項，用逗號分隔">`}
    </div>`).join("") : '<div class="empty">目前沒有自訂題目；系統已內建姓名、系級、學號、電話、餐點。</div>';
  setHtml("registerFieldsBox", html);
  bindFieldEvents();
}

function imageOptionEditor(field, fieldIndex){
  const opts = field.imageOptions || [];
  return `<div class="image-option-box">
    <p class="hint">每個選項填名稱，圖片可用「選擇圖片」或點選貼上區後 Ctrl+V 貼上（支援 Win+Shift+S 截圖）。學生端會看到圖片，報名資料只記錄選項名稱。</p>
    <div class="image-option-grid">
      ${opts.map((o,j)=>`
        <div class="image-option-card">
          <input class="field image-opt-label" data-i="${fieldIndex}" data-j="${j}" value="${esc(o.label || "")}" placeholder="選項名稱，例如：兔子">
          <div class="image-paste-zone" tabindex="0" data-i="${fieldIndex}" data-j="${j}">
            ${o.imageUrl ? `<img class="image-option-preview" src="${esc(o.imageUrl)}" alt="${esc(o.label || "圖片選項")}">` : `<span>點這裡後 Ctrl+V<br>或選擇圖片</span>`}
          </div>
          <input type="file" class="image-opt-file hidden-file" data-i="${fieldIndex}" data-j="${j}" accept="image/*">
          <div class="image-option-actions">
            <button type="button" class="ghost-btn image-opt-upload" data-i="${fieldIndex}" data-j="${j}">選擇圖片</button>
            <button type="button" class="ghost-btn danger-btn image-opt-clear" data-i="${fieldIndex}" data-j="${j}">清除圖片</button>
            <button type="button" class="ghost-btn danger-btn image-opt-remove" data-i="${fieldIndex}" data-j="${j}">刪除選項</button>
          </div>
        </div>`).join("")}
    </div>
    <button type="button" class="ghost-btn image-opt-add" data-i="${fieldIndex}">＋新增圖片選項</button>
  </div>`;
}

function renderFbQuestions(){
  const html = fbQuestions.length ? fbQuestions.map((q,i)=>`
    <div class="field-item">
      <div class="field-row">
        <input class="field fb-question" data-i="${i}" value="${esc(q)}" placeholder="請輸入滿意度題目">
        <span></span>
        <button type="button" class="ghost-btn fb-remove" data-i="${i}">移除</button>
      </div>
    </div>`).join("") : '<div class="empty">目前沒有滿意度題目，請按「新增滿意度題目」。</div>';
  setHtml("feedbackQuestionsBox", html);
  bindFieldEvents();
}


function renderFeedbackTextQuestions(){
  const html = feedbackTextQuestions.length ? feedbackTextQuestions.map((q,i)=>`
    <div class="field-item">
      <div class="field-row">
        <input class="field fb-text-question" data-i="${i}" value="${esc(q.label || "")}" placeholder="例如：你對本次活動最大的收穫是什麼？">
        <select class="field fb-text-type" data-i="${i}">
          <option value="textarea" ${q.type==="textarea"?"selected":""}>段落</option>
          <option value="text" ${q.type==="text"?"selected":""}>簡答</option>
        </select>
        <button type="button" class="ghost-btn fb-text-remove" data-i="${i}">移除</button>
      </div>
      <label><input type="checkbox" class="fb-text-required" data-i="${i}" ${q.required ? "checked" : ""}> 必填</label>
    </div>`).join("") : '<div class="empty">目前沒有回饋簡答題目。</div>';
  setHtml("feedbackTextQuestionsBox", html);
  bindFieldEvents();
}


async function uploadImageOptionFile(fieldIndex, optionIndex, file){
  if(!file) return;
  if(!file.type.startsWith("image/")){
    alert("圖片選項只能上傳圖片檔。");
    return;
  }
  if(file.size > 10 * 1024 * 1024){
    alert("圖片太大，建議 10MB 以下。");
    return;
  }
  try{
    const uploaded = await uploadFileToGithub(file, "image-options");
    const f = regFields[fieldIndex];
    f.imageOptions = f.imageOptions || [];
    f.imageOptions[optionIndex] = f.imageOptions[optionIndex] || {label:"", imageUrl:""};
    f.imageOptions[optionIndex].imageUrl = uploaded.url;
    f.imageOptions[optionIndex].imageName = uploaded.name;
    f.imageOptions[optionIndex].imagePath = uploaded.path;
    renderRegFields();
  }catch(err){
    console.error(err);
    if(String(err.message).includes("Token")) showView("settings");
    alert("圖片上傳失敗：" + err.message);
  }
}

async function handleImageOptionPaste(event){
  const zone = event.target.closest(".image-paste-zone");
  if(!zone) return;
  const items = event.clipboardData?.items || [];
  const item = Array.from(items).find(x => x.type && x.type.startsWith("image/"));
  if(!item) return;
  event.preventDefault();
  const file = item.getAsFile();
  if(file){
    const namedFile = new File([file], `clipboard_${Date.now()}.png`, {type:file.type || "image/png"});
    await uploadImageOptionFile(Number(zone.dataset.i), Number(zone.dataset.j), namedFile);
  }
}

function bindFieldEvents(){
  document.querySelectorAll(".meal-option-input").forEach(el => el.oninput = () => mealOptions[Number(el.dataset.i)] = el.value);
  document.querySelectorAll(".meal-option-remove").forEach(el => el.onclick = () => { mealOptions.splice(Number(el.dataset.i),1); renderMealOptions(); });
  document.querySelectorAll(".reg-label").forEach(el => el.oninput = () => regFields[Number(el.dataset.i)].label = el.value);
  document.querySelectorAll(".reg-type").forEach(el => el.onchange = () => {
    const i = Number(el.dataset.i);
    regFields[i].type = el.value;
    if(el.value === "imageRadio" && !regFields[i].imageOptions) regFields[i].imageOptions = [];
    renderRegFields();
  });
  document.querySelectorAll(".reg-required").forEach(el => el.onchange = () => regFields[Number(el.dataset.i)].required = el.checked);
  document.querySelectorAll(".reg-options").forEach(el => el.oninput = () => regFields[Number(el.dataset.i)].options = el.value.split(",").map(x=>x.trim()).filter(Boolean));
  document.querySelectorAll(".image-opt-label").forEach(el => el.oninput = () => {
    const f = regFields[Number(el.dataset.i)];
    f.imageOptions = f.imageOptions || [];
    f.imageOptions[Number(el.dataset.j)].label = el.value;
  });
  document.querySelectorAll(".image-opt-upload").forEach(el => el.onclick = () => {
    document.querySelector(`.image-opt-file[data-i="${el.dataset.i}"][data-j="${el.dataset.j}"]`)?.click();
  });
  document.querySelectorAll(".image-opt-file").forEach(el => el.onchange = () => {
    const file = el.files?.[0];
    if(file) uploadImageOptionFile(Number(el.dataset.i), Number(el.dataset.j), file);
  });
  document.querySelectorAll(".image-paste-zone").forEach(el => {
    el.onpaste = handleImageOptionPaste;
    el.ondragover = e => { e.preventDefault(); el.classList.add("drag-over"); };
    el.ondragleave = () => el.classList.remove("drag-over");
    el.ondrop = e => {
      e.preventDefault();
      el.classList.remove("drag-over");
      const file = e.dataTransfer?.files?.[0];
      if(file) uploadImageOptionFile(Number(el.dataset.i), Number(el.dataset.j), file);
    };
  });
  document.querySelectorAll(".image-opt-clear").forEach(el => el.onclick = () => {
    const f = regFields[Number(el.dataset.i)];
    f.imageOptions = f.imageOptions || [];
    f.imageOptions[Number(el.dataset.j)].imageUrl = "";
    f.imageOptions[Number(el.dataset.j)].imageName = "";
    f.imageOptions[Number(el.dataset.j)].imagePath = "";
    renderRegFields();
  });
  document.querySelectorAll(".image-opt-add").forEach(el => el.onclick = () => {
    const f = regFields[Number(el.dataset.i)];
    f.imageOptions = f.imageOptions || [];
    f.imageOptions.push({label:"", imageUrl:""});
    renderRegFields();
  });
  document.querySelectorAll(".image-opt-remove").forEach(el => el.onclick = () => {
    const f = regFields[Number(el.dataset.i)];
    f.imageOptions = f.imageOptions || [];
    f.imageOptions.splice(Number(el.dataset.j),1);
    renderRegFields();
  });
  document.querySelectorAll(".reg-remove").forEach(el => el.onclick = () => { regFields.splice(Number(el.dataset.i),1); renderRegFields(); });
  document.querySelectorAll(".fb-question").forEach(el => el.oninput = () => fbQuestions[Number(el.dataset.i)] = el.value);
  document.querySelectorAll(".fb-remove").forEach(el => el.onclick = () => { fbQuestions.splice(Number(el.dataset.i),1); renderFbQuestions(); });
  document.querySelectorAll(".att-name").forEach(el => el.oninput = () => attachments[Number(el.dataset.i)].name = el.value);
  document.querySelectorAll(".att-url").forEach(el => el.oninput = () => attachments[Number(el.dataset.i)].url = el.value);
  document.querySelectorAll(".att-remove").forEach(el => el.onclick = () => { attachments.splice(Number(el.dataset.i),1); renderAttachments(); });
  document.querySelectorAll(".fb-text-question").forEach(el => el.oninput = () => feedbackTextQuestions[Number(el.dataset.i)].label = el.value);
  document.querySelectorAll(".fb-text-type").forEach(el => el.onchange = () => feedbackTextQuestions[Number(el.dataset.i)].type = el.value);
  document.querySelectorAll(".fb-text-required").forEach(el => el.onchange = () => feedbackTextQuestions[Number(el.dataset.i)].required = el.checked);
  document.querySelectorAll(".fb-text-remove").forEach(el => el.onclick = () => { feedbackTextQuestions.splice(Number(el.dataset.i),1); renderFeedbackTextQuestions(); });
}

async function saveActivity(event){
  event.preventDefault();
  event.stopPropagation();

  const data = cleanUndefined({
    academicYear: val("academicYear").trim(),
    semester: val("semester"),
    title: val("title").trim(),
    date: val("date"),
    time: val("time").trim(),
    location: val("location").trim(),
    tags: [...new Set(getSelectedTags())],
    description: val("description").trim(),
    capacity: Number(val("capacity") || 0),
    status: val("status") || "open",
    published: checked("published"),
    fixedFields: {
      studentId: checked("showStudentId"),
      department: checked("showDepartment"),
      phone: checked("showPhone"),
      biologicalSex: checked("showBiologicalSex")
    },
    enableMeal: checked("enableMeal"),
    mealOptions: mealOptions.filter(Boolean),
    registerOpenAt: val("registerOpenAt"),
    registerCloseAt: val("registerCloseAt"),
    feedbackOpenAt: val("feedbackOpenAt"),
    feedbackCloseAt: val("feedbackCloseAt"),
    attachments: attachments.filter(a => (a.name || a.url)),
    registerFields: regFields,
    feedbackQuestions: fbQuestions.filter(Boolean),
    feedbackTextQuestions: feedbackTextQuestions.filter(q => q.label),
    feedbackMinWords: Number(val("feedbackMinWords") || 30),
    updatedAt: serverTimestamp()
  });

  if(!data.title || !data.date){
    alert("活動名稱和日期必填");
    return;
  }

  try{
    const id = val("editId");
    if(id){
      await updateDoc(doc(db, "activities", id), data);
    }else{
      data.registeredCount = 0;
      data.feedbackCount = 0;
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "activities"), data);
    }
    alert("已儲存");
    resetForm();
    showView("activities");
  }catch(err){
    console.error(err);
    alert("儲存失敗：" + err.message);
  }
}

async function deleteActivity(id){
  if(!confirm("確定刪除此活動？")) return;
  await deleteDoc(doc(db, "activities", id));
}

async function copyLink(url){
  await navigator.clipboard.writeText(url);
  alert("已複製連結");
}

function downloadQr(url, name){
  const qr = "https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=" + encodeURIComponent(url);
  window.open(qr, "_blank");
}
function downloadQrA4(url, title){
  const qr = "https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=" + encodeURIComponent(url);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:18mm}body{font-family:'Microsoft JhengHei',sans-serif;text-align:center}h1{font-size:28pt;margin-top:20mm}.qr{width:130mm;height:130mm;margin:20mm auto 8mm}.url{font-size:12pt;word-break:break-all}.hint{font-size:18pt;margin-top:8mm}</style></head><body><h1>${esc(title)}</h1><img class="qr" src="${qr}"><div class="hint">請掃描 QR Code</div><div class="url">${esc(url)}</div><script>window.onload=()=>window.print()</script></body></html>`;
  const w = window.open("", "_blank"); w.document.write(html); w.document.close();
}

async function viewRegistrations(id){
  const a = activities.find(x=>x.id===id);
  const snap = await getDocs(collection(db, "activities", id, "registrations"));
  const rows = snap.docs.map(d=>({docId:d.id,...d.data()}));
  const custom = a.registerFields || [];
  const table = rows.length ? `<table class="data-table">
    <thead><tr><th>#</th><th>姓名</th><th>單位／班級</th><th>學號／職員編號</th><th>聯絡電話</th><th>生理性別</th><th>餐點</th>${custom.map(f=>`<th>${esc(f.label)}</th>`).join("")}<th>操作</th></tr></thead>
    <tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td>${esc(r.department)}</td><td>${esc(r.studentId)}</td><td>${esc(r.phone)}</td><td>${esc(r.biologicalSex||"")}</td><td>${esc(r.meal)}</td>${custom.map(f=>`<td>${esc(r.customAnswers?.[f.label]||"")}</td>`).join("")}<td><button class="ghost-btn" data-edit-reg="${id}" data-student="${esc(r.docId)}">修改</button><button class="ghost-btn danger-btn" data-delete-reg="${id}" data-student="${esc(r.docId)}">刪除</button></td></tr>`).join("")}</tbody>
  </table>` : '<div class="empty">目前沒有人報名</div>';
  setHtml("modalContent", `<button class="modal-close" data-modal-close type="button">×</button><h2>${esc(a.title)}｜報名名單 <span class="quick-count">${rows.length} 人</span></h2>${table}<p><button class="primary-btn" data-export-regs="${id}">下載簽到表</button></p>`);
  $("modal")?.classList.remove("hidden");
}

async function lookupStudentActivities(){
  const input = val("studentLookupInput").trim().toUpperCase();
  if(!input){
    setHtml("studentLookupResult", '<div class="empty">請先輸入學號。</div>');
    return;
  }

  setHtml("studentLookupResult", '<div class="empty">查詢中...</div>');
  const rows = [];

  for(const a of activities){
    try{
      let regData = null;
      let regId = input;

      const directSnap = await getDoc(doc(db, "activities", a.id, "registrations", input));
      if(directSnap.exists()){
        regData = directSnap.data();
        regId = directSnap.id;
      }else{
        const regsSnap = await getDocs(collection(db, "activities", a.id, "registrations"));
        const found = regsSnap.docs.find(d => String(d.data().studentId || d.id || "").trim().toUpperCase() === input);
        if(found){
          regData = found.data();
          regId = found.id;
        }
      }

      if(regData){
        let hasFeedback = false;
        const fbDirect = await getDoc(doc(db, "activities", a.id, "feedbacks", regId));
        if(fbDirect.exists()){
          hasFeedback = true;
        }else{
          const fbsSnap = await getDocs(collection(db, "activities", a.id, "feedbacks"));
          hasFeedback = fbsSnap.docs.some(d => String(d.data().studentId || d.id || "").trim().toUpperCase() === input);
        }
        rows.push({ activity:a, reg:regData, hasFeedback });
      }
    }catch(err){
      console.warn("lookup skipped", a.id, err);
    }
  }

  if(!rows.length){
    setHtml("studentLookupResult", `<div class="empty">查無 ${esc(input)} 的活動報名紀錄。</div>`);
    return;
  }

  setHtml("studentLookupResult", `<table class="data-table">
    <thead><tr><th>#</th><th>活動</th><th>日期</th><th>地點</th><th>餐點</th><th>回饋</th><th>標籤</th></tr></thead>
    <tbody>${rows.map((row,i)=>`<tr>
      <td>${i+1}</td>
      <td>${esc(row.activity.title)}</td>
      <td>${esc(row.activity.date || "")}</td>
      <td>${esc(row.activity.location || "")}</td>
      <td>${esc(row.reg.meal || "")}</td>
      <td>${row.hasFeedback ? "已填" : "未填"}</td>
      <td>${tagHtml(row.activity.tags || [])}</td>
    </tr>`).join("")}</tbody>
  </table>`);
}

async function exportRegistrations(id){
  const a = activities.find(x=>x.id===id);
  const snap = await getDocs(collection(db, "activities", id, "registrations"));
  const rows = snap.docs.map(d=>d.data());
  const week = weekdayText(a.date);
  const rocDate = rocDateText(a.date);
  const timeText = a.time ? `${rocDate}${week ? `（${week}）` : ""} ${esc(a.time)}` : `${rocDate}${week ? `（${week}）` : ""}`;
  const headerLine = `${esc(a.academicYear || "")} 學年度第 ${esc(a.semester || "")} 學期 健康與諮商中心`;
  const titleLine = `資源教室「${esc(a.title || "")}」活動簽到表`;

  const minRows = 30;
  const pairedRows = [];
  for(let i=0; i<Math.max(rows.length, minRows); i+=2){
    pairedRows.push([rows[i] || null, rows[i+1] || null]);
  }

  // 1cm 約 37.8px；Word width 屬性用 px 近似。
  // 姓名 2.1cm、簽到 2.1cm、單位／班級 3cm、性別 2.1cm。
  const wName = 'style="width:2.1cm;mso-width-source:userset;mso-width-alt:1191" width="79"';
  const wSign = 'style="width:2.1cm;mso-width-source:userset;mso-width-alt:1191" width="79"';
  const wDept = 'style="width:3cm;mso-width-source:userset;mso-width-alt:1701" width="113"';
  const wGender = 'style="width:2.3cm;mso-width-source:userset;mso-width-alt:1304;text-align:center;white-space:nowrap" width="87"';

  function genderMark(gender){
    if(gender === "男") return "■男 □女";
    if(gender === "女") return "□男 ■女";
    return "□男 □女";
  }

  function block(r){
    if(!r){
      return `<td class="name-cell" ${wName}></td><td class="sign-cell" ${wSign}></td><td class="dept-cell" ${wDept}></td><td class="gender-cell" ${wGender}>□男 □女</td>`;
    }
    return `<td class="name-cell" ${wName}>${esc(r.name || "")}</td><td class="sign-cell" ${wSign}></td><td class="dept-cell" ${wDept}>${esc(r.department || "")}</td><td class="gender-cell" ${wGender}>${genderMark(r.biologicalSex || "")}</td>`;
  }

  const bodyRows = pairedRows.map(pair=>`<tr style="height:0.92cm">${block(pair[0])}${block(pair[1])}</tr>`).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8">
  <style>
    @page WordSection1{size:595.3pt 841.9pt;margin:36pt 36pt 36pt 36pt;mso-header-margin:0pt;mso-footer-margin:0pt}
    div.WordSection1{page:WordSection1}
    body{font-family:'DFKai-SB','標楷體','BiauKai',serif;font-size:12pt;line-height:1.35;margin:0}
    .top{font-size:16pt;text-align:center;font-weight:bold;line-height:1.35}
    h1{font-size:20pt;text-align:center;margin:4pt 0 10pt;font-family:'DFKai-SB','標楷體','BiauKai',serif}
    .meta{font-size:12pt;margin:4pt 0}
    table{border-collapse:collapse;table-layout:fixed;width:19cm;font-size:12pt;margin-top:8pt;mso-table-layout-alt:fixed}
    td,th{border:1px solid #333;padding:2pt;vertical-align:middle;font-size:12pt;height:0.92cm;overflow:hidden;mso-padding-alt:2pt 2pt 2pt 2pt}
    th{text-align:center;font-weight:bold}
    .name-cell{width:2.1cm;mso-width-source:userset;mso-width-alt:1191}
    .sign-cell{width:2.1cm;mso-width-source:userset;mso-width-alt:1191}
    .dept-cell{width:3cm;mso-width-source:userset;mso-width-alt:1701}
    .gender-cell{width:2.3cm;mso-width-source:userset;mso-width-alt:1304;text-align:center;white-space:nowrap}
  </style></head><body><div class="WordSection1">
    <div class="top">${headerLine}</div>
    <h1>${titleLine}</h1>
    <p class="meta">時間：${timeText}</p>
    <p class="meta">地點：${esc(a.location || "")}</p>
    <table width="718" style="width:19cm;table-layout:fixed">
      <colgroup>
        <col width="79" style="width:2.1cm"><col width="79" style="width:2.1cm"><col width="113" style="width:3cm"><col width="87" style="width:2.3cm">
        <col width="79" style="width:2.1cm"><col width="79" style="width:2.1cm"><col width="113" style="width:3cm"><col width="87" style="width:2.3cm">
      </colgroup>
      <tr style="height:0.92cm">
        <th class="name-cell" ${wName}>姓名</th><th class="sign-cell" ${wSign}>簽到欄</th><th class="dept-cell" ${wDept}>單位／班級</th><th class="gender-cell" ${wGender}>生理性別</th>
        <th class="name-cell" ${wName}>姓名</th><th class="sign-cell" ${wSign}>簽到欄</th><th class="dept-cell" ${wDept}>單位／班級</th><th class="gender-cell" ${wGender}>生理性別</th>
      </tr>
      ${bodyRows}
    </table>
  </div></body></html>`;

  downloadFile((a.title || "活動") + "_簽到表.doc", html, "application/msword");
}

async function viewFeedbacks(id){
  const a = activities.find(x=>x.id===id);
  const snap = await getDocs(collection(db, "activities", id, "feedbacks"));
  const rows = snap.docs.map(d=>({docId:d.id,...d.data()}));
  const qs = a.feedbackQuestions || [];
  const textQs = a.feedbackTextQuestions || [];
  const table = rows.length ? `<table class="data-table"><thead><tr><th>#</th><th>姓名</th><th>學號</th>${qs.map(q=>`<th>${esc(q)}</th>`).join("")}${textQs.map(q=>`<th>${esc(q.label)}</th>`).join("")}<th>心得</th><th>操作</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td>${esc(r.studentId)}</td>${qs.map(q=>`<td>${esc(r.ratings?.[q]||"")}</td>`).join("")}${textQs.map(q=>`<td>${esc(r.textAnswers?.[q.label]||"")}</td>`).join("")}<td>${esc(r.comment||"")}</td><td><button class="ghost-btn" data-edit-fb="${id}" data-student="${esc(r.docId)}">修改</button><button class="ghost-btn danger-btn" data-delete-fb="${id}" data-student="${esc(r.docId)}">刪除</button></td></tr>`).join("")}</tbody></table>` : '<div class="empty">目前沒有人填寫回饋</div>';
  setHtml("modalContent", `<button class="modal-close" data-modal-close type="button">×</button><h2>${esc(a.title)}｜回饋資料 <span class="quick-count">${rows.length} 份</span></h2>${table}<p><button class="primary-btn" data-export-fbs="${id}">下載回饋資料</button></p>`);
  $("modal")?.classList.remove("hidden");
}

async function editRegistration(activityId, studentId){
  const a = activities.find(x=>x.id===activityId);
  if(!a) return alert("找不到活動資料。");
  const snap = await getDoc(doc(db, "activities", activityId, "registrations", studentId));
  if(!snap.exists()) return alert("找不到這筆報名資料。");
  const r = snap.data();
  const custom = a.registerFields || [];

  const customRows = custom.map(f => {
    const v = r.customAnswers?.[f.label] || "";
    if(f.type === "textarea"){
      return `<label>${esc(f.label)}</label><textarea class="field edit-reg-custom" data-label="${esc(f.label)}">${esc(v)}</textarea>`;
    }
    if(f.type === "radio" || f.type === "imageRadio"){
      const opts = f.type === "imageRadio" ? (f.imageOptions || []).map(o=>o.label).filter(Boolean) : (f.options || []);
      return `<label>${esc(f.label)}</label><select class="field edit-reg-custom" data-label="${esc(f.label)}">
        <option value=""></option>
        ${opts.map(o=>`<option value="${esc(o)}" ${v===o?"selected":""}>${esc(o)}</option>`).join("")}
      </select>`;
    }
    return `<label>${esc(f.label)}</label><input class="field edit-reg-custom" data-label="${esc(f.label)}" value="${esc(v)}">`;
  }).join("");

  const mealOptions = (a.mealOptions || []).map(o => typeof o === "string" ? o : (o.label || "")).filter(Boolean);
  const mealInput = mealOptions.length
    ? `<select class="field" name="meal"><option value=""></option>${mealOptions.map(o=>`<option value="${esc(o)}" ${(r.meal||"")===o?"selected":""}>${esc(o)}</option>`).join("")}</select>`
    : `<input class="field" name="meal" value="${esc(r.meal || "")}">`;

  setHtml("modalContent", `
    <button class="modal-close" data-modal-close type="button">×</button>
    <h2>修改報名資料</h2>
    <form id="editRegForm" class="edit-data-form">
      <label>姓名</label><input class="field" name="name" value="${esc(r.name || "")}">
      <label>單位／班級</label><input class="field" name="department" value="${esc(r.department || "")}">
      <label>學號／職員編號</label><input class="field" name="studentId" value="${esc(r.studentId || "")}">
      <label>聯絡電話</label><input class="field" name="phone" value="${esc(r.phone || "")}">
      <label>生理性別</label>
      <select class="field" name="biologicalSex">
        <option value=""></option>
        <option value="男" ${r.biologicalSex==="男"?"selected":""}>男</option>
        <option value="女" ${r.biologicalSex==="女"?"selected":""}>女</option>
      </select>
      <label>餐點</label>${mealInput}
      ${customRows}
      <div class="modal-actions">
        <button class="primary-btn" type="submit">儲存修改</button>
        <button class="ghost-btn" type="button" data-view-regs="${activityId}">返回名單</button>
      </div>
    </form>
  `);
  $("modal")?.classList.remove("hidden");

  $("editRegForm").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const customAnswers = {...(r.customAnswers || {})};
    document.querySelectorAll(".edit-reg-custom").forEach(el => customAnswers[el.dataset.label] = el.value);
    await updateDoc(doc(db, "activities", activityId, "registrations", studentId), {
      name: fd.get("name") || "",
      department: fd.get("department") || "",
      studentId: fd.get("studentId") || "",
      phone: fd.get("phone") || "",
      biologicalSex: fd.get("biologicalSex") || "",
      meal: fd.get("meal") || "",
      customAnswers,
      updatedAt: serverTimestamp()
    });
    alert("報名資料已修改。");
    viewRegistrations(activityId);
  });
}

async function editFeedback(activityId, studentId){
  const a = activities.find(x=>x.id===activityId);
  if(!a) return alert("找不到活動資料。");
  const snap = await getDoc(doc(db, "activities", activityId, "feedbacks", studentId));
  if(!snap.exists()) return alert("找不到這筆回饋資料。");
  const r = snap.data();
  const qs = a.feedbackQuestions || [];
  const textQs = a.feedbackTextQuestions || [];
  const likert = ["非常滿意","滿意","普通","不滿意","非常不滿意"];

  const ratingRows = qs.map(q => {
    const v = r.ratings?.[q] || "";
    return `<label>${esc(q)}</label>
      <select class="field edit-fb-rating" data-label="${esc(q)}">
        <option value=""></option>
        ${likert.map(o => `<option value="${o}" ${v===o?"selected":""}>${o}</option>`).join("")}
      </select>`;
  }).join("");

  const textRows = textQs.map(q => {
    const v = r.textAnswers?.[q.label] || "";
    return `<label>${esc(q.label)}</label><textarea class="field edit-fb-text" data-label="${esc(q.label)}">${esc(v)}</textarea>`;
  }).join("");

  setHtml("modalContent", `
    <button class="modal-close" data-modal-close type="button">×</button>
    <h2>修改回饋資料</h2>
    <form id="editFbForm" class="edit-data-form">
      <label>姓名</label><input class="field" name="name" value="${esc(r.name || "")}">
      <label>學號／職員編號</label><input class="field" name="studentId" value="${esc(r.studentId || "")}">
      ${ratingRows}
      ${textRows}
      <label>心得</label><textarea class="field" name="comment">${esc(r.comment || "")}</textarea>
      <div class="modal-actions">
        <button class="primary-btn" type="submit">儲存修改</button>
        <button class="ghost-btn" type="button" data-view-fbs="${activityId}">返回回饋資料</button>
      </div>
    </form>
  `);
  $("modal")?.classList.remove("hidden");

  $("editFbForm").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const ratings = {...(r.ratings || {})};
    document.querySelectorAll(".edit-fb-rating").forEach(el => ratings[el.dataset.label] = el.value);
    const textAnswers = {...(r.textAnswers || {})};
    document.querySelectorAll(".edit-fb-text").forEach(el => textAnswers[el.dataset.label] = el.value);
    await updateDoc(doc(db, "activities", activityId, "feedbacks", studentId), {
      name: fd.get("name") || "",
      studentId: fd.get("studentId") || "",
      ratings,
      textAnswers,
      comment: fd.get("comment") || "",
      updatedAt: serverTimestamp()
    });
    alert("回饋資料已修改。");
    viewFeedbacks(activityId);
  });
}

async function deleteRegistration(activityId, studentId){
  if(!confirm("確定刪除此報名資料？")) return;
  await deleteDoc(doc(db, "activities", activityId, "registrations", studentId));
  viewRegistrations(activityId);
}
async function deleteFeedback(activityId, studentId){
  if(!confirm("確定刪除此回饋資料？")) return;
  await deleteDoc(doc(db, "activities", activityId, "feedbacks", studentId));
  viewFeedbacks(activityId);
}

async function exportFeedbacks(id){
  const a = activities.find(x=>x.id===id);
  const snap = await getDocs(collection(db, "activities", id, "feedbacks"));
  const rows = snap.docs.map(d=>d.data());
  const textQs = a.feedbackTextQuestions || [];
  const headers = ["姓名","學號",...(a.feedbackQuestions||[]),...textQs.map(q=>q.label),"心得"];
  const data = rows.map(r => [r.name,r.studentId,...(a.feedbackQuestions||[]).map(q=>r.ratings?.[q]||""),...textQs.map(q=>r.textAnswers?.[q.label]||""),r.comment]);
  downloadCsv(a.title+"_回饋資料.csv", [headers,...data]);
}

async function exportFeedbackWord(id){
  const a = activities.find(x=>x.id===id);
  const snap = await getDocs(collection(db, "activities", id, "feedbacks"));
  const rows = snap.docs.map(d=>d.data());
  const qs = a.feedbackQuestions || [];
  const textQs = a.feedbackTextQuestions || [];
  const total = rows.length || 1;
  const week = weekdayText(a.date);
  const dateLine = `實施日期：${esc(a.date || "")}${week ? `（${week}）` : ""} ${esc(a.time || "")}`;
  const headerLine = `${esc(a.academicYear || "")}學年度第 ${esc(a.semester || "")} 學期明新科技大學　學務處健康與諮商中心資源教室`;
  const tableRows = qs.map((q,i)=>{
    const cells = likertOptions.map(o=>{
      const count = rows.filter(r=>r.ratings?.[q]===o).length;
      return `<td>${round(count/total*100)}%</td>`;
    }).join("");
    return `<tr><td class="item">${i+1}. ${esc(q)}</td>${cells}</tr>`;
  }).join("");
  const textBlocks = textQs.map((q, qi)=>{
    const answers = rows.map((r,i)=>r.textAnswers?.[q.label] ? `<p>(${i+1}) ${esc(r.textAnswers[q.label])}</p>` : "").join("");
    return `<h2>${qs.length + qi + 1}. ${esc(q.label)}</h2>${answers || "<p>無填答資料</p>"}`;
  }).join("");
  const comments = rows.map((r,i)=>r.comment ? `<p>(${i+1}) ${esc(r.comment||"")}</p>` : "").join("");
  const html = `<!doctype html><html><head><meta charset="utf-8">
  <style>
    @page WordSection1{size:595.3pt 841.9pt;margin:36pt 36pt 36pt 36pt;mso-header-margin:0pt;mso-footer-margin:0pt}
    div.WordSection1{page:WordSection1}
    body{font-family:'DFKai-SB','標楷體','BiauKai',serif;font-size:12pt;line-height:1.35;margin:0}
    h1{font-size:24pt;text-align:center;margin:6pt 0 8pt;font-family:'DFKai-SB','標楷體','BiauKai',serif}
    h2{font-size:12pt;margin:10pt 0 5pt;font-family:'DFKai-SB','標楷體','BiauKai',serif}
    .top{font-size:16pt;text-align:center;font-weight:bold;line-height:1.2;white-space:nowrap}
    .meta{font-size:12pt;margin:4pt 0}
    table{border-collapse:collapse;width:100%;font-size:12pt}
    td,th{border:1px solid #333;padding:4pt;vertical-align:middle;font-size:12pt}
    th{font-weight:bold;text-align:center}
    .item{text-align:justify;text-justify:inter-ideograph;width:48%}
    .item-head{text-align:justify;text-align-last:justify;text-justify:inter-ideograph}
    p{margin:5pt 0}
  </style></head><body><div class="WordSection1">
  <div class="top">${headerLine}</div>
  <h1>「${esc(a.title)}」回饋表</h1>
  <p class="meta">${dateLine}</p>
  <p class="meta">主　　題：${esc(a.title)}</p>
  <p class="meta">活動地點：${esc(a.location||"")}</p>
  <h2>一、活動滿意度</h2>
  <table><tr><th class="item-head">項　目</th>${likertOptions.map(o=>`<th>${o}</th>`).join("")}</tr>${tableRows}</table>
  ${textBlocks}
  <h2>${qs.length + textQs.length + 1}. 本次活動的心得及對你最大的幫助是什麼？</h2>${comments || "<p>無填答資料</p>"}
  </div></body></html>`;
  downloadFile(a.title+"_活動回饋表.doc", html, "application/msword");
}

function downloadCsv(filename, rows){
  const csv = rows.map(r => r.map(v => `"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
  downloadFile(filename, "\ufeff"+csv, "text/csv;charset=utf-8");
}

function downloadFile(filename, content, type){
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function rocDateText(dateStr){
  if(!dateStr) return "";
  const d = new Date(dateStr);
  if(Number.isNaN(d.getTime())) return esc(dateStr);
  return `${d.getFullYear()-1911} 年 ${d.getMonth()+1} 月 ${d.getDate()} 日`;
}

function weekdayText(dateStr){
  if(!dateStr) return "";
  const d = new Date(dateStr);
  if(Number.isNaN(d.getTime())) return "";
  return ["星期日","星期一","星期二","星期三","星期四","星期五","星期六"][d.getDay()];
}


function getSelectedTags(){
  return Array.from(document.querySelectorAll("#tagSelectBox .tag-check:checked")).map(el => el.value);
}

function renderTagSelect(selected=[]){
  const selectedTags = Array.isArray(selected) ? selected : [];
  const box = $("tagSelectBox");
  if(!box) return;
  if(!systemTags.length){
    box.innerHTML = '<div class="empty">尚未建立標籤，請到「系統設定」新增。</div>';
    return;
  }
  box.innerHTML = systemTags.map(t => `
    <label class="tag-check-label">
      <input type="checkbox" class="tag-check" value="${esc(t)}" ${selectedTags.includes(t) ? "checked" : ""}>
      <span class="tag ${tagColorClass(t)}">${esc(t)}</span>
    </label>
  `).join("");
}

function renderTagManager(){
  const box=$("tagManageBox"); if(!box) return;
  box.innerHTML=systemTags.length ? systemTags.map(t=>`<span class="tag-manage-item"><span class="tag ${tagColorClass(t)}">${esc(t)}</span><button type="button" class="ghost-btn danger-btn" data-remove-tag="${esc(t)}">刪除</button></span>`).join("") : '<div class="empty">目前尚未建立標籤。</div>';
}
async function loadTags(){
  const snap=await getDoc(doc(db,"settings","activityTags"));
  systemTags=snap.exists() ? (snap.data().tags || []) : [];
  renderTagManager(); renderTagSelect([]);
}
async function saveTags(){
  await setDoc(doc(db,"settings","activityTags"),{tags: systemTags,updatedAt:serverTimestamp()},{merge:true});
  renderTagManager(); renderTagSelect(getSelectedTags());
}

function formatDateTime(v){ return String(v || "").replace("T"," "); }
function round(n){ return Math.round(n*10)/10; }
function statusText(s){ return {open:"報名中",feedback:"回饋中",closed:"已結束",draft:"草稿"}[s] || "活動"; }
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

function esc(str){ return String(str || "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])); }


function selectedStatItems(){
  return [...document.querySelectorAll(".stat-item:checked")].map(el => el.value);
}

function activityInStatRange(a, mode, year, start, end){
  if(mode === "year"){
    return String(a.academicYear || "") === String(year || "").trim();
  }
  const d = String(a.date || "");
  if(start && d < start) return false;
  if(end && d > end) return false;
  return true;
}

async function collectActivityDetails(activityList){
  const details = [];
  for(const a of activityList){
    const regsSnap = await getDocs(collection(db, "activities", a.id, "registrations"));
    const fbsSnap = await getDocs(collection(db, "activities", a.id, "feedbacks"));
    details.push({
      activity: a,
      registrations: regsSnap.docs.map(d => ({docId:d.id, ...d.data()})),
      feedbacks: fbsSnap.docs.map(d => ({docId:d.id, ...d.data()}))
    });
  }
  return details;
}

function countBy(rows, getter){
  const out = {};
  rows.forEach(r => {
    const key = getter(r) || "未填";
    out[key] = (out[key] || 0) + 1;
  });
  return out;
}

function statTable(title, obj){
  const entries = Object.entries(obj).sort((a,b)=>b[1]-a[1]);
  if(!entries.length) return `<section class="stat-section"><h3>${esc(title)}</h3><div class="empty">沒有資料</div></section>`;
  const total = entries.reduce((s,[,v])=>s+v,0) || 1;
  return `<section class="stat-section"><h3>${esc(title)}</h3><table class="data-table"><thead><tr><th>項目</th><th>數量</th><th>比例</th></tr></thead><tbody>
    ${entries.map(([k,v])=>`<tr><td>${esc(k)}</td><td>${v}</td><td>${Math.round(v/total*1000)/10}%</td></tr>`).join("")}
  </tbody></table></section>`;
}

async function runStatistics(){
  const mode = val("statMode");
  const year = val("statYear");
  const start = val("statStart");
  const end = val("statEnd");
  const items = selectedStatItems();
  const includeDraft = checked("includeDraftStats");
  const includeClosed = checked("includeClosedStats");
  const includeEmpty = checked("includeEmptyStats");

  if(mode === "year" && !year){
    alert("請輸入學年度，例如：115");
    return;
  }
  if(mode === "range" && !start && !end){
    alert("請至少選擇開始日期或結束日期。");
    return;
  }

  setHtml("statsResult", '<div class="empty">統計中...</div>');

  let picked = activities.filter(a => activityInStatRange(a, mode, year, start, end));
  if(!includeDraft) picked = picked.filter(a => a.published !== false);
  if(!includeClosed) picked = picked.filter(a => a.status !== "closed");
  if(!includeEmpty) picked = picked.filter(a => Number(a.registeredCount || 0) > 0);

  const details = await collectActivityDetails(picked);
  const allRegs = details.flatMap(d => d.registrations.map(r => ({...r, activity:d.activity})));
  const allFbs = details.flatMap(d => d.feedbacks.map(r => ({...r, activity:d.activity})));

  const totalActivities = details.length;
  const totalRegs = allRegs.length;
  const uniquePeople = new Set(allRegs.map(r => r.studentId || r.docId || r.name).filter(Boolean)).size;
  const totalFeedbacks = allFbs.length;

  latestStatsRows = [
    ["統計範圍", mode === "year" ? `學年度 ${year}` : `${start || "不限"} 至 ${end || "不限"}`],
    ["活動數", totalActivities],
    ["報名人次", totalRegs],
    ["不重複人數", uniquePeople],
    ["回饋份數", totalFeedbacks]
  ];

  let html = `<div class="stats summary-cards">
    <div class="stat-card"><span>活動數</span><strong>${totalActivities}</strong></div>
    <div class="stat-card"><span>報名人次</span><strong>${totalRegs}</strong></div>
    <div class="stat-card"><span>不重複人數</span><strong>${uniquePeople}</strong></div>
    <div class="stat-card"><span>回饋份數</span><strong>${totalFeedbacks}</strong></div>
  </div>`;

  if(items.includes("activityList")){
    html += `<section class="stat-section"><h3>活動清單</h3><table class="data-table"><thead><tr><th>學年度</th><th>學期</th><th>日期</th><th>活動</th><th>標籤</th><th>報名</th><th>回饋</th></tr></thead><tbody>
      ${details.map(d => `<tr><td>${esc(d.activity.academicYear || "")}</td><td>${esc(d.activity.semester || "")}</td><td>${esc(d.activity.date || "")}</td><td>${esc(d.activity.title || "")}</td><td>${esc((d.activity.tags || []).join("、"))}</td><td>${d.registrations.length}</td><td>${d.feedbacks.length}</td></tr>`).join("")}
    </tbody></table></section>`;
    latestStatsRows.push(["活動清單"]);
    details.forEach(d => latestStatsRows.push([d.activity.academicYear||"", d.activity.semester||"", d.activity.date||"", d.activity.title||"", (d.activity.tags||[]).join("、"), d.registrations.length, d.feedbacks.length]));
  }

  if(items.includes("sex")){
    const data = countBy(allRegs, r => r.biologicalSex);
    html += statTable("生理性別統計", data);
    latestStatsRows.push(["生理性別統計"], ...Object.entries(data));
  }

  if(items.includes("unit")){
    const data = countBy(allRegs, r => r.department);
    html += statTable("單位／班級統計", data);
    latestStatsRows.push(["單位／班級統計"], ...Object.entries(data));
  }

  if(items.includes("tags")){
    const tagRows = [];
    details.forEach(d => (d.activity.tags || ["未標籤"]).forEach(t => tagRows.push(t || "未標籤")));
    const data = countBy(tagRows, x => x);
    html += statTable("活動標籤統計", data);
    latestStatsRows.push(["活動標籤統計"], ...Object.entries(data));
  }

  if(items.includes("meal")){
    const data = countBy(allRegs, r => r.meal);
    html += statTable("餐點統計", data);
    latestStatsRows.push(["餐點統計"], ...Object.entries(data));
  }

  if(items.includes("custom")){
    const customCounts = {};
    allRegs.forEach(r => {
      Object.entries(r.customAnswers || {}).forEach(([q,a]) => {
        if(!customCounts[q]) customCounts[q] = {};
        const key = a || "未填";
        customCounts[q][key] = (customCounts[q][key] || 0) + 1;
      });
    });
    Object.entries(customCounts).forEach(([q,obj]) => {
      html += statTable(`自訂題：${q}`, obj);
      latestStatsRows.push([`自訂題：${q}`], ...Object.entries(obj));
    });
  }

  if(items.includes("feedback")){
    const scoreMap = {"非常滿意":5,"滿意":4,"普通":3,"不滿意":2,"非常不滿意":1};
    const ratingAgg = {};
    allFbs.forEach(r => {
      Object.entries(r.ratings || {}).forEach(([q,a]) => {
        if(!ratingAgg[q]) ratingAgg[q] = {sum:0,count:0,dist:{}};
        ratingAgg[q].sum += scoreMap[a] || 0;
        ratingAgg[q].count += scoreMap[a] ? 1 : 0;
        ratingAgg[q].dist[a || "未填"] = (ratingAgg[q].dist[a || "未填"] || 0) + 1;
      });
    });
    Object.entries(ratingAgg).forEach(([q,info]) => {
      const avg = info.count ? Math.round(info.sum/info.count*100)/100 : 0;
      html += `<section class="stat-section"><h3>回饋滿意度：${esc(q)} <span class="quick-count">平均 ${avg}</span></h3></section>`;
      html += statTable(q, info.dist);
      latestStatsRows.push([`回饋滿意度：${q}`, `平均 ${avg}`], ...Object.entries(info.dist));
    });
  }

  if(items.includes("overview") && totalActivities === 0){
    html += '<div class="empty">此範圍內沒有活動。</div>';
  }

  setHtml("statsResult", html);
}

function downloadStatsCsv(){
  if(!latestStatsRows.length){
    alert("請先產生統計。");
    return;
  }
  downloadCsv("活動統計.csv", latestStatsRows);
}

function collectFilesFromActivities(){
  const rows = [];
  activities.forEach(a => {
    (a.attachments || []).forEach((f,i) => rows.push({activityId:a.id, activityTitle:a.title, source:"attachments", index:i, name:f.name || `附件${i+1}`, url:f.url || "", path:f.path || ""}));
    (a.registerFields || []).forEach((field,fi) => {
      (field.imageOptions || []).forEach((o,oi) => {
        if(o.imageUrl) rows.push({activityId:a.id, activityTitle:a.title, source:"registerImage", fieldIndex:fi, optionIndex:oi, name:`${field.label || "圖片選項"}-${o.label || oi+1}`, url:o.imageUrl, path:o.imagePath || ""});
      });
    });
    (a.mealOptions || []).forEach((o,i) => {
      const item = typeof o === "string" ? {label:o} : o;
      if(item.imageUrl) rows.push({activityId:a.id, activityTitle:a.title, source:"mealImage", index:i, name:`餐點-${item.label || i+1}`, url:item.imageUrl, path:item.imagePath || ""});
    });
  });
  return rows;
}

async function refreshFiles(){
  latestFileRows = collectFilesFromActivities();
  setText("fileCount", latestFileRows.length);
  setText("fileSize", "估算中...");
  let knownTotal = 0;
  let knownCount = 0;
  for(const f of latestFileRows){
    if(f.size){ knownTotal += Number(f.size); knownCount++; continue; }
  }
  setText("fileSize", knownCount ? formatBytes(knownTotal) : "GitHub連結無法精準估算");
  renderFileList();
}

function renderFileList(){
  const html = latestFileRows.length ? `<table class="data-table"><thead><tr><th>活動</th><th>來源</th><th>檔名</th><th>連結</th><th>操作</th></tr></thead><tbody>
    ${latestFileRows.map((f,i)=>`<tr><td>${esc(f.activityTitle)}</td><td>${esc(fileSourceName(f.source))}</td><td>${esc(f.name)}</td><td><a href="${esc(f.url)}" target="_blank">開啟</a></td><td><button class="ghost-btn danger-btn" data-delete-file="${i}">刪除</button></td></tr>`).join("")}
  </tbody></table>` : '<div class="empty">目前沒有附件或圖片。</div>';
  setHtml("fileList", html);
}

function fileSourceName(source){
  return {attachments:"活動附件",registerImage:"報名圖片選項",mealImage:"餐點圖片"}[source] || source;
}

function formatBytes(bytes){
  if(!bytes) return "0 B";
  const units = ["B","KB","MB","GB"];
  let n = bytes, u = 0;
  while(n >= 1024 && u < units.length-1){ n/=1024; u++; }
  return `${Math.round(n*10)/10} ${units[u]}`;
}

async function deleteManagedFile(index){
  const f = latestFileRows[index];
  if(!f) return;
  if(!confirm(`確定刪除「${f.name}」？\n系統會移除活動中的檔案連結。`)) return;
  const a = activities.find(x => x.id === f.activityId);
  if(!a) return alert("找不到活動資料。");

  if(f.source === "attachments"){
    const arr = [...(a.attachments || [])];
    arr.splice(f.index,1);
    await updateDoc(doc(db,"activities",a.id), {attachments: arr});
  }else if(f.source === "registerImage"){
    const fields = [...(a.registerFields || [])];
    const opts = [...(fields[f.fieldIndex].imageOptions || [])];
    opts[f.optionIndex] = {...opts[f.optionIndex], imageUrl:"", imageName:"", imagePath:""};
    fields[f.fieldIndex] = {...fields[f.fieldIndex], imageOptions: opts};
    await updateDoc(doc(db,"activities",a.id), {registerFields: fields});
  }else if(f.source === "mealImage"){
    const meals = [...(a.mealOptions || [])].map(o => typeof o === "string" ? {label:o, imageUrl:""} : {...o});
    meals[f.index] = {...meals[f.index], imageUrl:"", imageName:"", imagePath:""};
    await updateDoc(doc(db,"activities",a.id), {mealOptions: meals});
  }

  alert("已移除檔案連結。若 GitHub 仍保留實體檔，可之後再手動清理。");
  setTimeout(refreshFiles, 500);
}

function bindClick(id, handler){
  const el = $(id);
  if(el) el.addEventListener("click", handler);
}

bindClick("loginBtn", async (e) => {
  e.preventDefault();
  try { await signInWithPopup(auth, provider); }
  catch(err){ console.error(err); alert("登入失敗：" + err.message); }
});

bindClick("logoutBtn", () => signOut(auth));
bindClick("saveGithubTokenBtn", e => {
  e.preventDefault();
  setGithubToken(val("githubTokenInput").trim());
  setVal("githubTokenInput", "");
  alert("GitHub Token 已儲存在這台電腦的瀏覽器。");
});
bindClick("addTagBtn", async e=>{e.preventDefault(); const tag=val("tagInput").trim(); if(!tag) return; if(!systemTags.includes(tag)) systemTags.push(tag); setVal("tagInput",""); await saveTags();});
bindClick("studentLookupBtn", e=>{e.preventDefault(); lookupStudentActivities();});
bindClick("runStatsBtn", e=>{e.preventDefault(); runStatistics();});
bindClick("downloadStatsCsvBtn", e=>{e.preventDefault(); downloadStatsCsv();});
bindClick("refreshFilesBtn", e=>{e.preventDefault(); refreshFiles();});
bindClick("newActivityBtn", (e) => { e.preventDefault(); showView("activities"); resetForm(); });
bindClick("resetBtn", (e) => { e.preventDefault(); resetForm(); });
bindClick("addMealOptionBtn", e => { e.preventDefault(); mealOptions.push(""); renderMealOptions(); });
bindClick("addRegisterFieldBtn", (e) => { e.preventDefault(); regFields.push({label:"新題目", type:"text", required:false, options:[]}); renderRegFields(); });
bindClick("addFeedbackQuestionBtn", (e) => { e.preventDefault(); fbQuestions.push(""); renderFbQuestions(); });
bindClick("addFeedbackTextQuestionBtn", (e) => { e.preventDefault(); feedbackTextQuestions.push({label:"", type:"textarea", required:false}); renderFeedbackTextQuestions(); });
bindClick("uploadAttachmentBtn", e => { e.preventDefault(); uploadAttachment(); });
bindClick("addAttachmentBtn", (e) => { e.preventDefault(); attachments.push({name:"附件", url:""}); renderAttachments(); });

const activityForm = $("activityForm");
if(activityForm) activityForm.addEventListener("submit", saveActivity);

const adminSearch = $("adminSearch");
if(adminSearch) adminSearch.addEventListener("input", e => { adminSearchText = e.target.value.trim(); renderLists(); });

const addAdminBtn = $("addAdminBtn");
if(addAdminBtn) addAdminBtn.addEventListener("click", async () => {
  const email = val("adminEmailInput").trim();
  if(!email || !email.includes("@")) return alert("請輸入正確 Email");
  if(!adminEmails.includes(email)) adminEmails.push(email);
  await setDoc(doc(db, "settings", "admins"), { emails: adminEmails, updatedAt: serverTimestamp() }, { merge:true });
  setVal("adminEmailInput", "");
  renderAdmins();
});

document.addEventListener("click", async (e) => {
  if(e.target.closest("[data-modal-close]") || e.target.id === "modal"){
    closeModal();
    return;
  }

  const nav = e.target.closest(".nav-item");
  if(nav) return showView(nav.dataset.view);

  const edit = e.target.closest("[data-edit]");
  if(edit) return editActivity(edit.dataset.edit);

  const del = e.target.closest("[data-delete]");
  if(del) return deleteActivity(del.dataset.delete);

  const copy = e.target.closest("[data-copy]");
  if(copy) return copyLink(copy.dataset.copy);

  const qrp = e.target.closest("[data-qrprint]");
  if(qrp) return downloadQrA4(qrp.dataset.qrprint, qrp.dataset.title || "QR Code");

  const qr = e.target.closest("[data-qr]");
  if(qr) return downloadQr(qr.dataset.qr, qr.dataset.name || "qr");

  const viewRegs = e.target.closest("[data-view-regs]");
  if(viewRegs) return viewRegistrations(viewRegs.dataset.viewRegs);

  const viewFbs = e.target.closest("[data-view-fbs]");
  if(viewFbs) return viewFeedbacks(viewFbs.dataset.viewFbs);

  const regs = e.target.closest("[data-export-regs]");
  if(regs) return exportRegistrations(regs.dataset.exportRegs);

  const fbs = e.target.closest("[data-export-fbs]");
  if(fbs) return exportFeedbacks(fbs.dataset.exportFbs);

  const word = e.target.closest("[data-export-word]");
  if(word) return exportFeedbackWord(word.dataset.exportWord);

  const copyAct = e.target.closest("[data-copy-activity]");
  if(copyAct) return copyActivity(copyAct.dataset.copyActivity);

  const editReg = e.target.closest("[data-edit-reg]");
  if(editReg) return editRegistration(editReg.dataset.editReg, editReg.dataset.student);

  const editFb = e.target.closest("[data-edit-fb]");
  if(editFb) return editFeedback(editFb.dataset.editFb, editFb.dataset.student);

  const delReg = e.target.closest("[data-delete-reg]");
  if(delReg) return deleteRegistration(delReg.dataset.deleteReg, delReg.dataset.student);

  const delFb = e.target.closest("[data-delete-fb]");
  if(delFb) return deleteFeedback(delFb.dataset.deleteFb, delFb.dataset.student);

  const delFile = e.target.closest("[data-delete-file]");
  if(delFile) return deleteManagedFile(Number(delFile.dataset.deleteFile));

  const remTag=e.target.closest("[data-remove-tag]");
  if(remTag){ systemTags=systemTags.filter(t=>t!==remTag.dataset.removeTag); await saveTags(); return; }

  const removeAdmin = e.target.closest("[data-remove-admin]");
  if(removeAdmin){
    adminEmails = adminEmails.filter(x => x !== removeAdmin.dataset.removeAdmin);
    await setDoc(doc(db, "settings", "admins"), {emails: adminEmails, updatedAt: serverTimestamp()}, {merge:true});
    renderAdmins();
  }
});

document.addEventListener("keydown", e => {
  if(e.key === "Escape") closeModal();
});

onAuthStateChanged(auth, async user => {
  if(!user){
    $("loginView")?.classList.remove("hidden");
    $("appView")?.classList.add("hidden");
    return;
  }
  currentUser = user;
  await loadAdmins();
  await loadTags();
  if(!isAdmin(user.email)){
    alert("這個帳號沒有後台權限：" + user.email);
    await signOut(auth);
    return;
  }
  $("loginView")?.classList.add("hidden");
  $("appView")?.classList.remove("hidden");
  setText("userInfo", user.email);
  resetForm();
  listenActivities();
});

const studentLookupInputEl=$("studentLookupInput");
if(studentLookupInputEl) studentLookupInputEl.addEventListener("keydown", e=>{if(e.key==="Enter"){e.preventDefault(); lookupStudentActivities();}});
const tagInputEl=$("tagInput");
if(tagInputEl) tagInputEl.addEventListener("keydown", e=>{if(e.key==="Enter"){e.preventDefault(); $("addTagBtn")?.click();}});
