const ADMIN="master004400@gmail.com";const te=new TextEncoder(),td=new TextDecoder();const un64=s=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
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
  const r=await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/${path}`,{headers:token?{Authorization:"Bearer "+token}:{}});
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
async function init(db){await db.batch([db.prepare('CREATE TABLE IF NOT EXISTS quizzes (id TEXT PRIMARY KEY, config TEXT NOT NULL, updated TEXT NOT NULL)'),db.prepare('CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, course TEXT NOT NULL, student TEXT NOT NULL, name TEXT NOT NULL, score INTEGER NOT NULL, passed INTEGER NOT NULL, created TEXT NOT NULL)'),db.prepare('CREATE INDEX IF NOT EXISTS attempts_course_student ON attempts(course,student)')]);}
function validate(config){
 const questions=config.questions;if(!Array.isArray(questions)||!questions.length||questions.length>50)throw Error('請建立 1～50 題單選題');
 if(!Number.isInteger(config.passScore)||config.passScore<0||config.passScore>100)throw Error('及格分數須為 0～100');
 for(const q of questions){if(!String(q.text||'').trim()||q.text.length>2000||!Array.isArray(q.options)||q.options.length<2||q.options.length>6||q.options.some(x=>!String(x).trim()||x.length>1000)||!Number.isInteger(q.answer)||q.answer<0||q.answer>=q.options.length)throw Error('請完整填寫題目、選項與正確答案');}
 return {allowRetake:config.allowRetake===true,showScore:config.showScore===true,passScore:config.passScore,questions:questions.map(q=>({text:q.text.trim(),options:q.options.map(x=>x.trim()),answer:q.answer}))};
}
function publicQuiz(q){return {...q,questions:q.questions.map(({answer,...rest})=>rest)};}
export default {async fetch(req,env){
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':FRONT_ORIGIN,'Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Vary':'Origin'};
 const out=(d,status=200)=>new Response(JSON.stringify(d),{status,headers});
 if(req.headers.get('Origin')!==FRONT_ORIGIN)return out({ok:false,error:'來源不符'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 try{
 if(!env.COURSES_DB)throw Error('課程考試服務尚未設定 COURSES_DB');await init(env.COURSES_DB);
 const u=new URL(req.url),id=u.searchParams.get('id');if(!/^[A-Za-z0-9_-]{1,200}$/.test(id||''))throw Error('課程 ID 不正確');
 if(u.pathname.startsWith('/api/admin/')){
 const {token}=await teacher(req);const a=await firestore('activities/'+id,token);if(!a||a.contentType!=='course')throw Error('找不到課程');
 if(u.pathname==='/api/admin/quiz'&&req.method==='PUT'){const q=validate(await req.json());await env.COURSES_DB.prepare('INSERT INTO quizzes(id,config,updated) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config,updated=excluded.updated').bind(id,JSON.stringify(q),new Date().toISOString()).run();return out({ok:true});}
 if(u.pathname==='/api/admin/quiz'&&req.method==='GET'){const row=await env.COURSES_DB.prepare('SELECT config FROM quizzes WHERE id=?').bind(id).first();return out({ok:true,quiz:row?JSON.parse(row.config):null});}
 if(u.pathname==='/api/admin/results'&&req.method==='GET'){const rows=await env.COURSES_DB.prepare('SELECT student,name,score,passed,created FROM attempts WHERE course=? ORDER BY created DESC LIMIT 2000').bind(id).all();return out({ok:true,results:rows.results});}
 }else{
 const a=await firestore('activities/'+id,'');if(!a||a.contentType!=='course'||a.published===false||a.status==='draft')throw Error('課程尚未開放');
 const row=await env.COURSES_DB.prepare('SELECT config,updated FROM quizzes WHERE id=?').bind(id).first();if(!row)throw Error('老師尚未建立考試');const q=JSON.parse(row.config);
 if(u.pathname==='/api/quiz'&&req.method==='GET')return out({ok:true,quiz:publicQuiz(q),version:row.updated});
 if(u.pathname==='/api/attempt'&&req.method==='POST'){
 const b=await req.json(),student=String(b.studentId||'').trim().toUpperCase(),name=String(b.name||'').trim();
 if(!/^[A-Z0-9_-]{3,40}$/.test(student)||!name||name.length>80)throw Error('請填寫姓名與正確學號／員編');
 if(b.version!==row.updated)throw Error('題目已更新，請重新載入後作答');
 if(!Array.isArray(b.answers)||b.answers.length!==q.questions.length||b.answers.some((x,i)=>!Number.isInteger(x)||x<0||x>=q.questions[i].options.length))throw Error('請完成所有題目');
 const score=Math.round(100*q.questions.filter((x,i)=>x.answer===b.answers[i]).length/q.questions.length),passed=score>=q.passScore,attempt=crypto.randomUUID();
 const result=await env.COURSES_DB.prepare('INSERT INTO attempts(id,course,student,name,score,passed,created) SELECT ?,?,?,?,?,?,? WHERE ?=1 OR NOT EXISTS(SELECT 1 FROM attempts WHERE course=? AND student=?)').bind(attempt,id,student,name,score,passed?1:0,new Date().toISOString(),q.allowRetake?1:0,id,student).run();
 if(!result.meta.changes)throw Error('此學號／員編已完成考試，這門課不允許重考');return out({ok:true,passed,...(q.showScore?{score}:{})});
 }
 }
 return out({ok:false,error:'找不到功能'},404);
 }catch(e){return out({ok:false,error:e.message},400);}
}};
