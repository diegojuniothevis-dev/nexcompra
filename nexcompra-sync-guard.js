/* NexCompra Sync Guard bootstrap v9.3.8 */
(() => {
  'use strict';

  function install(target) {
    try {
      if (!target || target.__NX_SYNC_GUARD_INSTALLED__) return;
      target.__NX_SYNC_GUARD_INSTALLED__ = true;
      const nativeFetch = target.fetch.bind(target);
      const MODULE = 'suite_localstorage';
      const states = new Map();
      const stateFor = id => { const k=String(id||''); if(!states.has(k)) states.set(k,{restored:false,lastKnownUpdatedAt:'',lastRemoteHash:'',lastPostedHash:'',blocked:0,skipped:0}); return states.get(k); };
      const stable = v => { try{return typeof v==='string'?v:JSON.stringify(v)}catch(_){return String(v??'')} };
      const hash = v => { const s=stable(v); let h=2166136261; for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)} return (h>>>0).toString(16)+':'+s.length; };
      const bodyOf = async req => { try{const t=await req.clone().text();return t?JSON.parse(t):null}catch(_){return null} };
      const rowOf = b => Array.isArray(b)?(b[0]||null):(b&&typeof b==='object'?b:null);
      const ok = () => new target.Response('[]',{status:200,headers:{'Content-Type':'application/json','X-NexCompra-Sync-Guard':'1'}});
      const newer = (a,b) => { if(!a||!b)return false; const x=Date.parse(a),y=Date.parse(b); return Number.isFinite(x)&&Number.isFinite(y)&&x>y+500; };
      async function remoteRow(req,companyId){try{const u=new target.URL(req.url);u.search='';u.searchParams.set('select','payload,updated_at');u.searchParams.set('company_id','eq.'+companyId);u.searchParams.set('module','eq.'+MODULE);u.searchParams.set('limit','1');const headers=new target.Headers(req.headers);headers.delete('content-type');const r=await nativeFetch(u.toString(),{method:'GET',headers,cache:'no-store'});if(!r.ok)return null;const j=await r.json().catch(()=>[]);return Array.isArray(j)?(j[0]||null):j}catch(_){return null}}
      target.fetch=async function(input,init){let req;try{req=new target.Request(input,init)}catch(_){return nativeFetch(input,init)}let u;try{u=new target.URL(req.url,target.location.href)}catch(_){return nativeFetch(input,init)}if(!/\/rest\/v1\/nx_app_state$/i.test(u.pathname))return nativeFetch(req);const method=(req.method||'GET').toUpperCase();const moduleEq=u.searchParams.get('module');if(method==='GET'&&moduleEq==='eq.'+MODULE){const cid=(u.searchParams.get('company_id')||'').replace(/^eq\./,'');if(u.searchParams.has('select')&&!u.searchParams.get('select').includes('updated_at'))u.searchParams.set('select',u.searchParams.get('select')+',updated_at');const r=await nativeFetch(new target.Request(u.toString(),req));try{const j=await r.clone().json();const row=Array.isArray(j)?j[0]:j,st=stateFor(cid);st.restored=true;if(row){st.lastKnownUpdatedAt=row.updated_at||'';st.lastRemoteHash=hash(row.payload)}}catch(_){stateFor(cid).restored=true}return r}const upsert=method==='POST'&&u.searchParams.get('on_conflict')==='company_id,module';if(!upsert)return nativeFetch(req);const body=await bodyOf(req),row=rowOf(body);if(!row||row.module!==MODULE||!row.company_id)return nativeFetch(req);const cid=String(row.company_id),st=stateFor(cid),outHash=hash(row.payload);if(!st.restored){const remote=await remoteRow(req,cid);if(remote){st.lastKnownUpdatedAt=remote.updated_at||'';st.lastRemoteHash=hash(remote.payload);st.blocked++;console.info('[NexCompra] autosave inicial bloqueado até restauração',cid);return ok()}st.restored=true}if(outHash===st.lastPostedHash||outHash===st.lastRemoteHash){st.skipped++;return ok()}const remote=await remoteRow(req,cid);if(remote){const rh=hash(remote.payload),ra=remote.updated_at||'';if(newer(ra,st.lastKnownUpdatedAt)&&rh!==outHash){st.lastKnownUpdatedAt=ra;st.lastRemoteHash=rh;st.blocked++;console.warn('[NexCompra] sessão antiga impedida de sobrescrever dados novos',cid);try{target.dispatchEvent(new target.CustomEvent('nexcompra:cloud-conflict',{detail:{message:'Dados mais recentes foram encontrados na nuvem.'}}))}catch(_){}return ok()}if(rh===outHash){st.lastKnownUpdatedAt=ra;st.lastRemoteHash=rh;st.skipped++;return ok()}if(!st.lastKnownUpdatedAt)st.lastKnownUpdatedAt=ra}const response=await nativeFetch(req);if(response.ok){st.lastPostedHash=outHash;st.lastRemoteHash=outHash;remoteRow(req,cid).then(x=>{if(x){st.lastKnownUpdatedAt=x.updated_at||st.lastKnownUpdatedAt;st.lastRemoteHash=hash(x.payload)}}).catch(()=>{})}return response};
      target.NX_SYNC_GUARD={version:'9.3.8',states,status(){return [...states.entries()].map(([companyId,s])=>({companyId,...s}))}};
      console.info('[NexCompra Sync Guard] v9.3.8 ativo.');
    } catch(e) { console.warn('[NexCompra Sync Guard] falha ao instalar',e); }
  }

  install(window);

  /* O bootstrap é carregado no about:blank antes da suíte. Registra no documento
     pai um instalador que reaplica a proteção assim que a navegação real termina. */
  try {
    const frame = parent && parent.document && parent.document.getElementById('nxapp');
    if (frame && parent !== window && !frame.__NX_GUARD_LOAD_BOUND__) {
      frame.__NX_GUARD_LOAD_BOUND__ = true;
      frame.addEventListener('load', () => {
        try { install(frame.contentWindow); } catch (_) {}
      });
    }
  } catch (_) {}
})();
