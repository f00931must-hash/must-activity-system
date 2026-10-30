const SITE='https://f00931must-hash.github.io/must-activity-system/';
export default {async fetch(request){
 const url=new URL(request.url),headers={'Access-Control-Allow-Origin':'https://f00931must-hash.github.io','Cache-Control':'no-store'};
 if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405,headers});
 if(url.pathname==='/health')return Response.json({ok:true,service:'must-activity-shortlinks',version:'1.0.0'},{headers});
 const match=url.pathname.match(/^\/a\/([A-Za-z0-9_-]{1,128})$/);
 if(!match)return new Response('找不到活動連結',{status:404,headers});
 const target=new URL('frontend/activity.html',SITE);target.searchParams.set('id',match[1]);
 return new Response(null,{status:302,headers:{...headers,Location:target.href}});
}};
