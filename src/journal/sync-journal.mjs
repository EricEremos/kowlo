// One invocation uses one verified user token. The caller owns sign-in and explicit sync consent.
export async function syncJournal({ journal, url, publishableKey, accessToken, signal, maxRequests = 20 }) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password ||
      endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
    throw new TypeError('Sync requires a configured HTTPS project origin');
  }
  if (typeof publishableKey !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    throw new TypeError('A public project key is required');
  }
  if (typeof accessToken !== 'string' || !accessToken.length || accessToken.length > 8192 || /\s/.test(accessToken)) {
    throw new TypeError('A user access token is required');
  }
  if (!Number.isInteger(maxRequests) || maxRequests < 2 || maxRequests > 100) {
    throw new TypeError('Request budget must be between 2 and 100');
  }
  signal?.throwIfAborted();
  const session = await journal.nextPullRequest();
  const counts = { requests: 0, pulled: 0, accepted: 0, retired: 0 };
  const result = status => ({ status, ...counts });
  function sameSession(request) {
    if (!request || request.sessionId !== session.sessionId || request.scope.kind !== 'account' ||
        request.scope.id !== session.scope.id) throw new DOMException('Sync session changed', 'AbortError');
    signal?.throwIfAborted();
  }
  sameSession(session);
  async function request(path, body) {
    signal?.throwIfAborted();
    counts.requests += 1;
    const timeout = AbortSignal.timeout(30000);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response;
    try {
      response = await fetch(`${endpoint.origin}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        credentials: 'omit', cache: 'no-store', redirect: 'error', signal: requestSignal,
      });
    } catch {
      requestSignal.throwIfAborted();
      throw new Error('Sync network request failed');
    }
    if (!response.ok) {
      // Do not propagate server bodies, which may echo private record content or credentials.
      throw new Error(response.status === 401 || response.status === 403 ? 'Sync authorization failed' : 'Sync server request failed');
    }
    try { return await response.json(); }
    catch { throw new Error('Invalid sync server response'); }
  }
  const user = await request('/auth/v1/user');
  if (user?.id !== session.scope.id) throw new DOMException('Authenticated account does not match journal', 'SecurityError');

  while (counts.requests < maxRequests) {
    let page;
    do {
      if (counts.requests >= maxRequests) return result('more');
      const pull = await journal.nextPullRequest();
      sameSession(pull);
      const rows = await request('/rest/v1/rpc/pull_journal_changes', { p_after: pull.after, p_limit: pull.limit });
      page = await journal.applyPullPage({ sessionId: session.sessionId, after: pull.after, rows });
      counts.pulled += page.count;
    } while (page.count === 500);

    // Finish pulling before choosing a dependency-sensitive write; never infer a conflict choice.
    const flight = await journal.nextSyncRequest();
    if (!flight) {
      sameSession(await journal.nextPullRequest());
      return result('caught-up');
    }
    sameSession(flight);
    if (flight.state === 'conflict') return result('conflict');
    if (counts.requests >= maxRequests) return result('more');
    let response;
    const identifiers = { p_token: flight.token, p_store: flight.store, p_id: flight.id };
    if (flight.state === 'reconcile') {
      response = await request('/rest/v1/rpc/retire_journal_put', identifiers);
    } else if (flight.state === 'ready') {
      response = await request('/rest/v1/rpc/apply_journal_change', { ...identifiers,
        p_operation: flight.operation, p_base_revision: flight.baseRevision, p_record: flight.record });
    } else throw new TypeError('Invalid sync request state');
    const input = { sessionId: session.sessionId, token: flight.token, response };
    const consumed = response?.status === 'retired'
      ? await journal.acceptSyncRetirement(input)
      : await journal.acceptSyncResult(input);
    if (!consumed) throw new DOMException('Sync request changed', 'AbortError');
    if (response.status === 'accepted') counts.accepted += 1;
    if (response.status === 'retired') counts.retired += 1;
  }
  return result('more');
}
