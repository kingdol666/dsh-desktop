/** Lossless-JSON projection shared by every pm tool envelope. */

/**
 * Project one tool value onto the lossless JSON the runtime accepts.
 *
 * `defineTool` validates that a tool's resolved value round-trips JSON; the CAE
 * engine can emit `NaN`/`Infinity` diagnostics and optional absent fields, so
 * every handler funnels through this one boundary.
 * @param value - tool value.
 * @returns a JSON-round-tripped plain object.
 */
export function toToolJson(value: unknown): Record<string, never> {
  return JSON.parse(JSON.stringify(value)) as never
}

/**
 * Default text renderer for JSON envelopes.
 * @param _args - model arguments (unused).
 * @param value - tool value.
 * @returns one text content block.
 */
export function renderJson(_args: unknown, value: unknown): { type: 'text'; text: string }[] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}
