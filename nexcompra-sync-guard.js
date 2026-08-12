/* NexCompra Sync Guard / Bootstrap v9.3.9 */
(() => {
  'use strict';

  const VERSION = '9.3.9';
  const MODULE = 'suite_localstorage';
  const SUITE_RE = /NexCompra_ERP_Suite_Integrada_v9_3_SUPABASE\.html/i;

  function textOf(v){
    try { return typeof v === 'string' ? v : JSON.stringify(v); }
    catch (_) { return String(v ?? ''); }
  }

  function hash(v){
    const s = textOf(v); let h = 2166136261;
    for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h,16777619); }
    return (h>>>0).toString(16)+':'+s.length;
  }

  function payloadStats(v){
    const raw = textOf(v);
    let meaningful = 0, records = 0;
    const visit = (x, depth=0) => {
      if(depth>7 || x==null) return;
      if(Array.isArray(x)){
        if(x.length){ meaningful += 2; records += x.length; }
        for(const y of x.slice(0,500)) visit(y,depth+1);
        return;
      }
      if(typeof x === 'object'){
        const ks=Object.keys(x); if(ks.length) meaningful += 1;
        for(const k of ks.slice(0,500)) visit(x[k],depth+1);
        return;
      }
      if(typeof x === 'number'){ if(x!==0){ meaningful++; records++; } return; }
      if(typeof x === 'boolean'){ if(x) meaningful++; return; }
      if(typeof x === 'string'){
        const s=x.trim();
        if(!s || /^(?:\[\]|\{\}|null|undefined|false|0)$/i.test(s)) return;
        if((s[0]==='['&&s.endsWith(']'))||(s[0]==='{'&&s.endsWith('}'))){
          try { visit(JSON.parse(s),depth+1); return; } catch(_) {}
        }
        meaningful++;
      }
    };
    try { visit(v); } catch(_) {}
    return { bytes: raw.length, meaningful, records };
  }

  function suspiciousEmpty(outgoing, remote){
    const o=payloadStats(outgoing), r=payloadStats(remote);
    if(r.bytes < 1500) return false;
    const massiveShrink = o.bytes < r.bytes * 0.38;
    const recordsGone = r.records >= 20 && o.records <= Math.max(2, Math.floor(r.records*0.08));
    const meaningGone = r.meaningful >= 20 && o.meaningful <= Math.max(3, Math.floor(r.meaningful*0.10));
    return massiveShrink || (recordsGone && meaningGone);
  }

  function install(target){
    try {
      if(!target || target.__NX_SYNC_GUARD_INSTALLED__) return;
      target.__NX_SYNC_GUARD_INSTALLED__ = VERSION;
      const nativeFetch=target.fetch.bind(target), states=new Map();
      const stateFor=id=>{const k=String(id||'');if(!states.has(k))states.set(k,{restored:false,lastKnownUpdatedAt:'',lastRemoteHash:'',lastPostedHash:'',blocked:0,skipped:0,emptyBlocked:0});return states.get(k)};
      const bodyOf=async req=>{try{const t=await req.clone().text();return t?JSON.parse(t):null}catch(_){return null}};
      const rowOf=b=>Array.isArray(b)?(b[0]||null):(b&&typeof b==='object'?b:null);
      const ok=reason=>new target.Response('[]',{status:200,headers:{'Content-Type':'application/json','X-NexCompra-Sync-Guard':reason||'1'}});
      const newer=(a,b)=>{if(!a||!b)return false;const x=Date.parse(a),y=Date.parse(b);return Number.isFinite(x)&&Number.isFinite(y)&&x>y+500};

      async function remoteRow(req,companyId){
        try{
          const u=new target.URL(req.url);u.search='';
          u.searchParams.set('select','payload,updated_at');
          u.searchParams.set('company_id','eq.'+companyId);
          u.searchParams.set('module','eq.'+MODULE);u.searchParams.set('limit','1');
          const headers=new target.Headers(req.headers);headers.delete('content-type');
          const r=await nativeFetch(u.toString(),{method:'GET',headers,cache:'no-store'});
          if(!r.ok)return null;const j=await r.json().catch(()=>[]);return Array.isArray(j)?(j[0]||null):j;
        }catch(_){return null}
      }

      target.fetch=async function(input,init){
        let req;try{req=new target.Request(input,init)}catch(_){return nativeFetch(input,init)}
        let u;try{u=new target.URL(req.url,target.location.href)}catch(_){return nativeFetch(req)}
        if(!/\/rest\/v1\/nx_app_state$/i.test(u.pathname)) return nativeFetch(req);
        const method=(req.method||'GET').toUpperCase(), moduleEq=u.searchParams.get('module');

        if(method==='GET' && moduleEq==='eq.'+MODULE){
          const cid=(u.searchParams.get('company_id')||'').replace(/^eq\./,'');
          if(u.searchParams.has('select')&&!u.searchParams.get('select').includes('updated_at')) u.searchParams.set('select',u.searchParams.get('select')+',updated_at');
          const r=await nativeFetch(new target.Request(u.toString(),req));
          try{
            const j=await r.clone().json(), row=Array.isArray(j)?j[0]:j, st=stateFor(cid);st.restored=true;
            if(row){st.lastKnownUpdatedAt=row.updated_at||'';st.lastRemoteHash=hash(row.payload)}
          }catch(_){stateFor(cid).restored=true}
          return r;
        }

        const upsert=method==='POST' && u.searchParams.get('on_conflict')==='company_id,module';
        if(!upsert) return nativeFetch(req);
        const body=await bodyOf(req), row=rowOf(body);
        if(!row || row.module!==MODULE || !row.company_id) return nativeFetch(req);
        const cid=String(row.company_id), st=stateFor(cid), outHash=hash(row.payload);

        const remote=await remoteRow(req,cid);
        if(!st.restored){
          if(remote){
            st.lastKnownUpdatedAt=remote.updated_at||'';st.lastRemoteHash=hash(remote.payload);st.blocked++;
            console.info('[NexCompra V9.3.9] autosave inicial bloqueado até restauração',cid);
            return ok('initial-restore');
          }
          st.restored=true;
        }

        if(remote){
          const rh=hash(remote.payload), ra=remote.updated_at||'';

          /* Proteção principal V9.3.9: nunca deixa um estado praticamente vazio
             apagar uma base já preenchida na nuvem. */
          if(rh!==outHash && suspiciousEmpty(row.payload,remote.payload)){
            st.lastKnownUpdatedAt=ra;st.lastRemoteHash=rh;st.blocked++;st.emptyBlocked++;
            console.error('[NexCompra V9.3.9] estado vazio bloqueado; base remota preservada',cid,payloadStats(row.payload),payloadStats(remote.payload));
            try{target.dispatchEvent(new target.CustomEvent('nexcompra:cloud-conflict',{detail:{type:'empty-state',message:'Uma tentativa de substituir dados existentes por um estado vazio foi bloqueada.'}}))}catch(_){}
            return ok('empty-state-blocked');
          }

          if(newer(ra,st.lastKnownUpdatedAt)&&rh!==outHash){
            st.lastKnownUpdatedAt=ra;st.lastRemoteHash=rh;st.blocked++;
            console.warn('[NexCompra V9.3.9] sessão antiga impedida de sobrescrever dados novos',cid);
            return ok('stale-session');
          }
          if(rh===outHash){st.lastKnownUpdatedAt=ra;st.lastRemoteHash=rh;st.skipped++;return ok('unchanged')}
          if(!st.lastKnownUpdatedAt)st.lastKnownUpdatedAt=ra;
        }

        if(outHash===st.lastPostedHash||outHash===st.lastRemoteHash){st.skipped++;return ok('duplicate')}
        const response=await nativeFetch(req);
        if(response.ok){
          st.lastPostedHash=outHash;st.lastRemoteHash=outHash;
          remoteRow(req,cid).then(x=>{if(x){st.lastKnownUpdatedAt=x.updated_at||st.lastKnownUpdatedAt;st.lastRemoteHash=hash(x.payload)}}).catch(()=>{});
        }
        return response;
      };

      target.NX_SYNC_GUARD={version:VERSION,states,payloadStats,status(){return [...states.entries()].map(([companyId,s])=>({companyId,...s}))}};
      console.info('[NexCompra Sync Guard] V'+VERSION+' ativo antes do ERP.');
    }catch(e){console.warn('[NexCompra Sync Guard] falha ao instalar',e)}
  }

  /* Quando este arquivo roda dentro da suíte protegida, a interceptação já está
     ativa antes dos scripts do ERP e do cliente Supabase. */
  install(window);

  /* Bootstrap: app.html abre primeiro about:blank. A V9.3.9 intercepta a
     navegação para a suíte, baixa o HTML e injeta este guard no <head> ANTES
     dos scripts originais. Assim a proteção não chega tarde como na V9.3.8. */
  try{
    const isBootstrap = parent!==window && String(location.href).startsWith('about:blank');
    const frame = isBootstrap && parent.document && parent.document.getElementById('nxapp');
    if(frame && !parent.__NX_V939_BOOTSTRAP__){
      parent.__NX_V939_BOOTSTRAP__=true;
      const proto=parent.HTMLIFrameElement.prototype;
      const desc=Object.getOwnPropertyDescriptor(proto,'src');
      if(desc&&desc.set&&desc.get){
        Object.defineProperty(proto,'src',{
          configurable:desc.configurable,enumerable:desc.enumerable,
          get:desc.get,
          set:function(value){
            if(this===frame && SUITE_RE.test(String(value)) && !this.__NX_V939_LOADING__){
              this.__NX_V939_LOADING__=true;
              const suiteUrl=new parent.URL(String(value),parent.location.href).toString();
              const baseUrl=new parent.URL('./',parent.location.href).toString();
              parent.fetch(suiteUrl,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.text()}).then(html=>{
                const injected='<base href="'+baseUrl.replace(/"/g,'&quot;')+'"><script src="nexcompra-sync-guard.js?v=939"><\\/script>';
                let protectedHtml;
                if(/<head[^>]*>/i.test(html)) protectedHtml=html.replace(/<head([^>]*)>/i,'<head$1>'+injected);
                else protectedHtml=injected+html;
                this.srcdoc=protectedHtml;
                this.dataset.nxVersion='9.3.9';
                console.info('[NexCompra V9.3.9] suíte carregada com proteção pré-execução.');
              }).catch(err=>{
                console.error('[NexCompra V9.3.9] bootstrap protegido falhou; usando navegação normal.',err);
                this.__NX_V939_LOADING__=false;desc.set.call(this,value);
              });
              return;
            }
            return desc.set.call(this,value);
          }
        });
      }
    }
  }catch(e){console.warn('[NexCompra V9.3.9] bootstrap indisponível',e)}
})();
