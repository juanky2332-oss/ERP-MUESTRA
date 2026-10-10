import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularTotales, tipoIva, importeLinea } from './totales.ts'

test('IVA 0 % se respeta (exento / inversión del sujeto pasivo), no pasa a 21 %', () => {
    const t = calcularTotales([{ cantidad: 2, precio_unitario: 100 }], 0)
    assert.equal(t.ivaPct, 0)
    assert.equal(t.ivaImporte, 0)
    assert.equal(t.total, 200)
})

test('sin tipo de IVA → 21 %; tipos raros o negativos → 21 %', () => {
    assert.equal(tipoIva(undefined), 21)
    assert.equal(tipoIva(''), 21)
    assert.equal(tipoIva(null), 21)
    assert.equal(tipoIva(-5), 21)
    assert.equal(tipoIva('10'), 10)
    assert.equal(tipoIva(0), 0)
})

test('líneas redondeadas a céntimos y base + IVA = total al céntimo', () => {
    // Precio de la calculadora con 3 decimales
    const t = calcularTotales([{ cantidad: 3, precio_unitario: 12.345 }, { cantidad: 7, precio_unitario: 0.333 }], 21)
    assert.equal(t.lineas[0].importe, 37.04)
    assert.equal(t.lineas[1].importe, 2.33)
    assert.equal(t.base, 39.37)
    assert.equal(t.ivaImporte, 8.27)
    assert.equal(t.total, 47.64)
    assert.equal(Math.round((t.base + t.ivaImporte) * 100), Math.round(t.total * 100))
})

test('el importe guardado en cada línea es cantidad × precio (antes se guardaba 0)', () => {
    const t = calcularTotales([{ cantidad: 5, precio_unitario: 40, importe: 40 }, { cantidad: 12, precio_unitario: 95, importe: 0 }], 21)
    assert.deepEqual(t.lineas.map(l => l.importe), [200, 1140])
    assert.equal(t.base, 1340)
    assert.equal(t.total, 1621.4)
})

test('casos de céntimos con redondeo .5 (10,05 × 21 %)', () => {
    const t = calcularTotales([{ cantidad: 1, precio_unitario: 10.05 }], 21)
    assert.equal(t.ivaImporte, 2.11)
    assert.equal(t.total, 12.16)
    assert.equal(importeLinea({ cantidad: 1.005, precio_unitario: 1000 }), 1005)
})

test('sin líneas → todo a 0', () => {
    const t = calcularTotales([], 21)
    assert.equal(t.total, 0)
    assert.equal(calcularTotales(null, 21).base, 0)
})
