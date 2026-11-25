# dsh-agent-skill (vendored patch)

Upstream: `dsh-agent-skill@0.3.0` (MIT, Velestia-star), npm tarball repacked as
`dsh-agent-skill-0.3.0-pm2.tgz`.

## Why patched

DSH 0.2.1-rc.3 changed the subagent activation contract and added per-child
presets. Upstream 0.3.0 still targets the older shape, so it cannot start any
child on this desktop:

1. `startActivation` is called with a flat spec (`parent`, `prompt`, `cwd`,
   `agentOptions`, `maxDepth`). rc.3 requires
   `{ provider, label, childId, request: { parent, prompt, cwd?, agentOptions?,
   agentPreset?, maxDepth? }, signal, delivery }`; the flat call leaves
   `spec.request` undefined and throws on `spec.request.maxDepth`.
2. Agent definitions have no `agentPreset`. A child therefore inherits the
   caller's preset, so a Reviewer delegating to Characterization is rejected by
   the polymer permission matrix.
3. The panel save path runs `normalizeAgent`, which drops unknown fields, so a
   seeded `agentPreset` would disappear the first time a user edits the agent.
4. `dsh.engines.dsh` says `>=0.2.2-rc.1`, which the desktop's rc.3 runtime
   rejects before the plugin ever loads.
5. `collectSkills` scanned only `$DSH_HOME/skills` and workspace roots, so the
   bundled `app/skills` and the programmatically registered pm-research skills
   never resolved: the panel showed ⚠ for every expert skill and the child
   prompt received none of them.

## Patch

- `normalizeAgent` preserves `agentPreset` (omitted when empty, so inheritance
  remains the default).
- `startDelegation` probes
  `subagents.getProvider(provider)?.capabilities?.agentPreset` and fails with a
  clear error instead of silently starting a child with the wrong preset.
- `startActivation` sends the rc.3 nested `request`, including
  `agentPreset` when the definition sets one.
- `dsh.engines.dsh` lowered to `>=0.2.1-rc.3`.
- `collectSkills` first absorbs `ctx.skills.list()/get()` (bundled + pm-research
  programmatic skills), then falls back to the filesystem roots; the registry
  wins duplicate names.
- Version `0.3.0-pm2`.

The vendored plugin is a production dependency of `dsh-plugin-desktop` and is
injected into every profile by `DESKTOP_SHIPPED_PLUGIN_BUNDLES`.

## Rebuild

```bash
npm pack dsh-agent-skill@0.3.0
tar -xzf dsh-agent-skill-0.3.0.tgz -C src
# apply the patches to src/package/index.js and src/package/package.json
cd src/package && npm pack --silent
cp dsh-agent-skill-0.3.0-pm1.tgz ../../dsh-agent-skill-0.3.0-pm1.tgz
```

## Drop this patch when

Upstream ships an rc.3-compatible `startActivation` plus `agentPreset` support
and raises `dsh.engines.dsh` accordingly. Re-check the panel save path keeps the
field before replacing this tarball.

## Related desktop code

- `dsh-plugin-desktop/src/agent-team-seed.ts` writes the five polymer expert
  definitions into `<DSH_HOME>/agent-skill/agents.json` once.
- `dsh-plugin-desktop/src/main.ts` calls the seed after `profileBoot.markReady()`.
- `skills/polymer-chief-route/SKILL.md` documents the routing and brief contract.
