# @bushizhanghan/dsh-context-budget (vendored patch)

Upstream: `@bushizhanghan/dsh-context-budget@0.1.2` (MIT), npm tarball repacked
as `dsh-context-budget-0.1.2-pm1.tgz`.

## Why patched

DSH 0.2.1-rc.3 validates a tool's `output.schema` as JSON Schema. Upstream
0.1.2 declares the non-standard shorthand

```js
const OUTPUT_SCHEMA = { type: 'json' }
```

so the host rejects every registration with

```
JsonSchemaError: unsupported JSON schema: schema.type must be one of
object/array/string/number/integer/boolean/null
```

and all four audit tools (`ctx_budget`, `ctx_budget_sweep`,
`ctx_budget_skills`, `ctx_budget_tools`) are silently skipped.

## Patch

```diff
- const OUTPUT_SCHEMA = { type: 'json' }
+ const OUTPUT_SCHEMA = { type: 'object', additionalProperties: true }
```

Every tool returns a plain JSON object (including `{ok:false, error}`), so a
permissive object schema is the correct contract. Version `0.1.2-pm1`.

## Rebuild

```bash
npm pack @bushizhanghan/dsh-context-budget@0.1.2
tar -xzf bushizhanghan-dsh-context-budget-0.1.2.tgz -C src
# apply the one-line diff to src/package/lib/index.js, bump package.json
cd src/package && npm pack --pack-destination <work-dir>
cp <work-dir>/*.tgz ../../dsh-context-budget-0.1.2-pm1.tgz
```

## Drop this patch when

Upstream uses a valid object schema (or the host starts accepting `json` as an
output-shape alias). Re-run `verify:profile` and confirm the four tools appear
in the global tool table.
