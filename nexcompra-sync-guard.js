/* NexCompra Sync Guard v9.3.8
 * Protege o estado nx_app_state/suite_localstorage contra:
 * - autosave antes da restauração inicial da nuvem;
 * - gravações idênticas repetidas;
 * - sobrescrita por uma aba/sessão que ficou desatualizada.
 */
(() => {
  'use strict';

  if (window.__NX_SYNC_GUARD_INSTALLED__) return;
  window.__NX_SYNC_GUARD_INSTALLED__ = true;

  const nativeFetch = window.fetch.bind(window);
  const MODULE = 'suite_localstorage';
  const states = new Map();

  const stateFor = (companyId) => {
    const key = String(companyId || '');
    if (!states.has(key)) {
      states.set(key, {
        restored: false,
        restoreSeenAt: 0,
        lastKnownUpdatedAt: '',
        lastRemoteHash: '',
        lastPostedHash: '',
        blocked: 0,
        skipped: 0
      });
    }
    return states.get(key);
  };

  const stableString = (value) => {
    try {
      if (typeof value === 'string') return value;
      return JSON.stringify(value);
    } catch (_) {
      return String(value ?? '');
    }
  };

  // Hash leve e determinístico, suficiente para evitar POSTs idênticos.
  const hash = (value) => {
    const s = stableString(value);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16) + ':' + s.length;
  };

  const parseBody = async (req) => {
    try {
      const text = await req.clone().text();
      if (!text) return null;
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  };

  const getRowFromPayload = (body) => {
    if (Array.isArray(body)) return body[0] || null;
    return body && typeof body === 'object' ? body : null;
  };

  const syntheticOk = () => new Response('[]', {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-NexCompra-Sync-Guard': '1' }
  });

  const notifyConflict = () => {
    try {
      window.dispatchEvent(new CustomEvent('nexcompra:cloud-conflict', {
        detail: { message: 'Há dados mais recentes salvos em outra sessão. Esta sessão não sobrescreveu a versão nova.' }
      }));
    } catch (_) {}
  };

  const apiRow = async (sourceReq, companyId) => {
    try {
      const u = new URL(sourceReq.url);
      u.search = '';
      u.searchParams.set('select', 'payload,updated_at');
      u.searchParams.set('company_id', 'eq.' + companyId);
      u.searchParams.set('module', 'eq.' + MODULE);
      u.searchParams.set('limit', '1');
      const headers = new Headers(sourceReq.headers);
      headers.delete('content-type');
      const r = await nativeFetch(u.toString(), { method: 'GET', headers, cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json().catch(() => []);
      return Array.isArray(j) ? (j[0] || null) : j;
    } catch (_) {
      return null;
    }
  };

  const observeGet = async (response, companyId) => {
    try {
      const rows = await response.clone().json();
      const row = Array.isArray(rows) ? rows[0] : rows;
      const st = stateFor(companyId);
      st.restored = true;
      st.restoreSeenAt = Date.now();
      if (row) {
        st.lastKnownUpdatedAt = row.updated_at || st.lastKnownUpdatedAt || '';
        st.lastRemoteHash = hash(row.payload);
      }
    } catch (_) {
      const st = stateFor(companyId);
      st.restored = true;
      st.restoreSeenAt = Date.now();
    }
  };

  const isNewer = (remoteAt, knownAt) => {
    if (!remoteAt || !knownAt) return false;
    const a = Date.parse(remoteAt);
    const b = Date.parse(knownAt);
    return Number.isFinite(a) && Number.isFinite(b) && a > b + 500;
  };

  window.fetch = async function nxGuardedFetch(input, init) {
    let req;
    try {
      req = new Request(input, init);
    } catch (_) {
      return nativeFetch(input, init);
    }

    let url;
    try { url = new URL(req.url, location.href); }
    catch (_) { return nativeFetch(input, init); }

    if (!/\/rest\/v1\/nx_app_state$/i.test(url.pathname)) {
      return nativeFetch(input, init);
    }

    const method = (req.method || 'GET').toUpperCase();
    const moduleEq = url.searchParams.get('module');
    const isSuiteGet = method === 'GET' && moduleEq === 'eq.' + MODULE;

    if (isSuiteGet) {
      const companyEq = url.searchParams.get('company_id') || '';
      const companyId = companyEq.replace(/^eq\./, '');
      // Acrescenta updated_at para controle de versão; o campo extra é inofensivo para o cliente.
      if (url.searchParams.has('select') && !url.searchParams.get('select').includes('updated_at')) {
        url.searchParams.set('select', url.searchParams.get('select') + ',updated_at');
      }
      const guardedReq = new Request(url.toString(), req);
      const response = await nativeFetch(guardedReq);
      if (companyId && response.ok) observeGet(response, companyId);
      return response;
    }

    const isUpsert = method === 'POST' && url.searchParams.get('on_conflict') === 'company_id,module';
    if (!isUpsert) return nativeFetch(req);

    const body = await parseBody(req);
    const row = getRowFromPayload(body);
    if (!row || row.module !== MODULE || !row.company_id) return nativeFetch(req);

    const companyId = String(row.company_id);
    const st = stateFor(companyId);
    const outgoingHash = hash(row.payload);

    // 1) Nunca grava o estado local antes de a restauração inicial da nuvem ter ocorrido.
    if (!st.restored) {
      const remote = await apiRow(req, companyId);
      if (remote) {
        st.lastKnownUpdatedAt = remote.updated_at || '';
        st.lastRemoteHash = hash(remote.payload);
        st.blocked++;
        console.info('[NexCompra Sync Guard] POST inicial bloqueado até a restauração da nuvem.', companyId);
        return syntheticOk();
      }
      // Empresa sem estado remoto: primeira gravação é permitida.
      st.restored = true;
      st.restoreSeenAt = Date.now();
    }

    // 2) Não envia novamente exatamente o mesmo conteúdo.
    if (outgoingHash === st.lastPostedHash || outgoingHash === st.lastRemoteHash) {
      st.skipped++;
      return syntheticOk();
    }

    // 3) Antes de substituir, confere se outra sessão gravou uma versão mais nova.
    const remote = await apiRow(req, companyId);
    if (remote) {
      const remoteHash = hash(remote.payload);
      const remoteAt = remote.updated_at || '';
      if (isNewer(remoteAt, st.lastKnownUpdatedAt) && remoteHash !== outgoingHash) {
        st.lastKnownUpdatedAt = remoteAt;
        st.lastRemoteHash = remoteHash;
        st.blocked++;
        console.warn('[NexCompra Sync Guard] Gravação desatualizada bloqueada.', companyId);
        notifyConflict();
        return syntheticOk();
      }
      // Se o remoto já é idêntico, evita POST redundante.
      if (remoteHash === outgoingHash) {
        st.lastKnownUpdatedAt = remoteAt;
        st.lastRemoteHash = remoteHash;
        st.skipped++;
        return syntheticOk();
      }
      if (!st.lastKnownUpdatedAt) st.lastKnownUpdatedAt = remoteAt;
    }

    const response = await nativeFetch(req);
    if (response.ok) {
      st.lastPostedHash = outgoingHash;
      st.lastRemoteHash = outgoingHash;
      // Atualiza o marcador do servidor sem depender de Prefer:return=representation.
      apiRow(req, companyId).then(latest => {
        if (!latest) return;
        st.lastKnownUpdatedAt = latest.updated_at || st.lastKnownUpdatedAt;
        st.lastRemoteHash = hash(latest.payload);
      }).catch(() => {});
    }
    return response;
  };

  // Sinalizador para diagnóstico no console e futuras versões.
  window.NX_SYNC_GUARD = {
    version: '9.3.8',
    states,
    status() {
      return [...states.entries()].map(([companyId, s]) => ({ companyId, ...s }));
    }
  };

  console.info('[NexCompra Sync Guard] v9.3.8 ativo.');
})();
