# dsh-cognition-engine (vendored patch)

Upstream: `dsh-cognition-engine@0.14.0` (MIT), npm tarball repacked as
`dsh-cognition-engine-0.14.0-pm4.tgz`.

## Why patched

The panel's playbook actions (`接受 / 拒绝 / 停用 / 恢复`) call
`/cognition-engine/playbook/act` with a bare `fetch()`, i.e. GET. The host route
is registered with `{ method: 'POST' }`, so every one of those buttons answers
`405 {"error":"method not allowed"}` and the 准则 tab cannot accept or reject a
distilled rule.

The patch adds one argument:

```diff
 const res = await call(
   `/cognition-engine/playbook/act?id=${encodeURIComponent(id)}&action=${action}` + (extra || ''),
+  { method: 'POST' },
 );
```

Rebuild with:

```bash
npm pack dsh-cognition-engine@0.14.0
tar -xzf dsh-cognition-engine-0.14.0.tgz -C src
# apply the client POST patch and the related-recall visibility filters
cd src/package && npm pack --silent --pack-destination ../..
```

The pm4 package also filters `expand` / `associative` related memories with the
same scope, subject, and required tags as the primary recall. This prevents
same-topic facts from other workspaces or domains from leaking into results.

## Related desktop config

The desktop patch layer also sets `cpeStrictGate: false` for this row: the CPE
gate moves every accepted rule to shadow while the regression set is empty, and
Desktop has no S5 regression workflow. Human accept/reject in the 准则 tab is
the remaining gate.
