const BASE='https://must-activity-course.f00931-must.workers.dev';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function videoHtml(url){
 if(!url)return '';let u;try{u=new URL(url);if(u.protocol!=='https:')return '';}catch{return '';}
 let src='',match;if(['youtu.be','www.youtu.be'].includes(u.hostname))src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(u.pathname.slice(1));
 else if(['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname)){const id=u.searchParams.get('v')||u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];if(id)src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(id);}
 else if(u.hostname==='drive.google.com'){const id=u.pathname.match(/\/file\/d\/([^/]+)/)?.[1]||u.searchParams.get('id');if(id)src='https://drive.google.com/file/d/'+encodeURIComponent(id)+'/preview';}
 if(src)return '<iframe title="課程影片" src="'+esc(src)+'" style="width:100%;aspect-ratio:16/9;border:0" allow="fullscreen; encrypted-media" allowfullscreen></iframe>';
 if(/\.mp4$/i.test(u.pathname))return '<video controls playsinline preload="metadata" style="width:100%" src="'+esc(u.href)+'"></video>';
 return '<a target="_blank" rel="noopener" href="'+esc(u.href)+'">開啟課程影片</a>';
}
export async function renderCourse(a,el){
 el.innerHTML='<h2>課程學習</h2>'+videoHtml(a.courseVideoUrl)+(a.courseExamEnabled?'<section id="courseExam"><p>載入考試中…</p></section>':'<p>本課程未啟用考試。</p>');if(!a.courseExamEnabled)return;
 const box=document.getElementById('courseExam');
 try{const res=await fetch(BASE+'/api/quiz?id='+encodeURIComponent(a.id)),d=await res.json();if(!res.ok||!d.ok)throw Error(d.error);const q=d.quiz;
 box.innerHTML='<h2>課程考試</h2><p>及格分數：'+q.passScore+' 分｜'+(q.allowRetake?'可以重新考試':'每個學號／員編限考一次')+'</p><form id="courseExamForm"><label>姓名</label><input class="field" name="name" required maxlength="80"><label>學號／員工編號</label><input class="field" name="studentId" required maxlength="40">'+q.questions.map((x,i)=>'<fieldset style="margin:16px 0;padding:16px"><legend>'+esc((i+1)+'. '+x.text)+'</legend>'+x.options.map((o,j)=>'<label class="radio-row"><input type="radio" name="q'+i+'" value="'+j+'" required> '+esc(o)+'</label>').join('')+'</fieldset>').join('')+'<p id="courseExamResult" role="status"></p><button type="submit" class="primary-btn">送出考試</button></form>';
 document.getElementById('courseExamForm').onsubmit=async e=>{e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;const f=new FormData(e.target),result=document.getElementById('courseExamResult');try{const r=await fetch(BASE+'/api/attempt?id='+encodeURIComponent(a.id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.get('name'),studentId:f.get('studentId'),answers:q.questions.map((x,i)=>Number(f.get('q'+i))),version:d.version})});const out=await r.json();if(!r.ok||!out.ok)throw Error(out.error);result.textContent=(out.score!==undefined?'分數：'+out.score+' 分，':'')+(out.passed?'及格':'未及格');if(!q.allowRetake){btn.textContent='已完成考試';return;}btn.textContent='重新送出考試';}catch(err){result.textContent=err.message;}btn.disabled=false;};
 }catch(e){box.innerHTML='<p>'+esc(e.message||'考試服務尚未完成設定')+'</p>';}
}
