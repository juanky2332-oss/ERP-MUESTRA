// Mini «expect» sobre node:assert para las pruebas copiadas de IndunexIA Presupuestos.
import assert from 'node:assert/strict'
export function expect(v: any) {
    return {
        toBe: (e: any) => assert.strictEqual(v, e),
        toEqual: (e: any) => assert.deepStrictEqual(v, e),
        toBeCloseTo: (e: number, d = 2) => assert.ok(Math.abs(v - e) < Math.pow(10, -d) / 2, `${v} ≉ ${e}`),
        toBeGreaterThan: (e: number) => assert.ok(v > e, `${v} no es > ${e}`),
        toContain: (e: any) => assert.ok(v.includes(e), `no contiene ${e}`),
        toHaveLength: (n: number) => assert.strictEqual(v.length, n),
    }
}
