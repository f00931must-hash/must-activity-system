const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('admin/js/admin.js','utf8');
function setup({allowed=true,fail='',signedIn=true}={}){
 const calls=[],handlers={},elements=new Map();
 const el=id=>{if(!elements.has(id))elements.set(id,{textContent:'',hidden:false,classList:{add(){elements.get(id).hidden=true;},remove(){elements.get(id).hidden=false;}}});return elements.get(id);};
 const user={uid:'fake',email:'assistant@example.test'};
 const ctx={console:{error(){}},setTimeout,clearTimeout,Promise,Error,String,
 $:el,setText:(id,text)=>el(id).textContent=text,
 auth:{currentUser:signedIn?user:null},provider:{setCustomParameters(){}},
 loadAdmins:async()=>{calls.push('admins');if(fail==='admins')throw {code:'permission-denied'};},
 isAdmin:()=>allowed,
 loadTags:async()=>{calls.push('tags');if(fail==='tags')throw {code:'permission-denied'};},
 loadCertificationSettings:async()=>{calls.push('certification');if(fail==='certification')throw {code:'permission-denied'};},
 resetForm:()=>calls.push('reset'),listenActivities:()=>calls.push('listen'),
 signInWithPopup:async()=>calls.push('popup'),signOut:async()=>{ctx.auth.currentUser=null;},
 bindClick:(id,handler)=>handlers[id]=handler,unsubscribe:null,activities:[],currentUser:null};
 vm.createContext(ctx);
 const start=source.indexOf('function loginStatus('),end=source.indexOf('bindClick("logoutBtn"',start);
 vm.runInContext(source.slice(start,end),ctx);
 return {ctx,calls,user,el,handlers};
}
test('authorized assistant completes backend startup',async()=>{
 const h=setup();await h.ctx.openAdmin(h.user);
 assert.deepEqual(h.calls,['admins','tags','certification','reset','listen']);assert.equal(h.el('appView').hidden,false);
});
test('unsynced account stops before protected data and explains synchronization',async()=>{
 const h=setup({allowed:false});await h.ctx.openAdmin(h.user);
 assert.deepEqual(h.calls,['admins']);assert.match(h.el('loginStatus').textContent,/同步活動權限/);assert.equal(h.el('appView').hidden,true);
});
for(const phase of ['admins','tags','certification'])test(`denied ${phase} leaves a visible retryable error`,async()=>{
 const h=setup({fail:phase});await h.ctx.openAdmin(h.user);
 assert.match(h.el('loginStatus').textContent,/permission-denied/);assert.equal(h.el('loginView').hidden,false);assert.equal(h.el('appView').hidden,true);assert.ok(!h.calls.includes('listen'));
});
test('login click retries initialization for an already signed-in account',async()=>{
 const h=setup();await h.handlers.loginBtn({preventDefault(){}});assert.ok(h.calls.includes('listen'));assert.ok(!h.calls.includes('popup'));
});
test('signed-out click opens popup directly',async()=>{
 const h=setup({signedIn:false});await h.handlers.loginBtn({preventDefault(){}});assert.deepEqual(h.calls,['popup']);
});
test('signing out during loading cannot open the previous account backend',async()=>{
 const h=setup();let finish;h.ctx.loadAdmins=()=>new Promise(resolve=>{finish=resolve;});
 const pending=h.ctx.openAdmin(h.user);h.ctx.auth.currentUser=null;await h.ctx.openAdmin(null);finish();await pending;
 assert.equal(h.el('appView').hidden,true);assert.ok(!h.calls.includes('tags'));
});
test('email authorization normalizes case and whitespace without adding accounts',()=>{
 const fn=source.match(/function isAdmin\(email\)\{[^\n]+/)[0];const ctx={adminEmails:['Assistant@Example.Test '],String};vm.createContext(ctx);vm.runInContext(fn,ctx);
 assert.equal(ctx.isAdmin(' assistant@example.test'),true);assert.equal(ctx.isAdmin('other@example.test'),false);
});
test('loading grants no automatic writes to the authorization list',()=>{
 const fn=source.slice(source.indexOf('async function loadAdmins'),source.indexOf('function renderAdmins'));
 assert.doesNotMatch(fn,/await setDoc/);
});
