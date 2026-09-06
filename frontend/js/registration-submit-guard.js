const SUBMITTING_TEXT = "送出中，請勿重複點擊…";
const ORIGINAL_TEXT = "送出報名";

function getSubmitButton(form){
  return form?.querySelector('button[type="submit"]');
}

function unlock(form){
  if(!form) return;
  form.dataset.submitLocked = "0";
  const btn = getSubmitButton(form);
  if(btn){
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
    btn.textContent = ORIGINAL_TEXT;
  }
}

function lock(form){
  form.dataset.submitLocked = "1";
  const btn = getSubmitButton(form);
  if(btn){
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.textContent = SUBMITTING_TEXT;
  }
}

// 使用 capture 在原本報名處理前先擋住連續送出。
document.addEventListener("submit", event => {
  const form = event.target;
  if(!(form instanceof HTMLFormElement) || form.id !== "regForm") return;

  if(form.dataset.submitLocked === "1"){
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }

  lock(form);

  const msg = form.querySelector("#msg");
  if(msg){
    const observer = new MutationObserver(() => {
      if(msg.querySelector(".error")){
        observer.disconnect();
        unlock(form);
      }
    });
    observer.observe(msg, { childList:true, subtree:true, characterData:true });

    // 若報名成功，原程式會整個替換 registerPanel，表單自然消失。
    const panel = document.getElementById("registerPanel");
    if(panel){
      const panelObserver = new MutationObserver(() => {
        if(!document.getElementById("regForm")){
          observer.disconnect();
          panelObserver.disconnect();
        }
      });
      panelObserver.observe(panel, { childList:true, subtree:true });
    }
  }
}, true);

// 若網路或程式發生未處理錯誤，避免按鈕永久卡死。
window.addEventListener("unhandledrejection", () => {
  const form = document.getElementById("regForm");
  if(!form || form.dataset.submitLocked !== "1") return;
  const msg = form.querySelector("#msg");
  if(msg && !msg.querySelector(".error")){
    msg.innerHTML = '<div class="error">連線異常，報名尚未確認完成，請稍後再試。</div>';
  }
  unlock(form);
});
