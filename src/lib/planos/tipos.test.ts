import { test } from 'node:test'
import assert from 'node:assert/strict'
import { precioConjunto, eurCortePorMetro, m2Chapas, perimetroChapas, TARIFAS_CALDERIA_DEFECTO as T } from './tipos.ts'

const sinProcesos = { corte_metros: null, perforaciones: null, plegados: null, soldadura_metros: null, soldadura_tipo: null, acabado: null, acabado_m2: null, montaje_horas: null }

test('mesa inox: material + plegados + margen (comprobado a mano)', () => {
    const r = precioConjunto([
        { nombre: 'Tablero', cantidad: 1, kgUnidad: 11.876, precioKg: 5.6, espesorMm: 1.5 },
        { nombre: 'Pata', cantidad: 4, kgUnidad: 1.646, precioKg: 5.6, espesorMm: 1.5 },
        { nombre: 'Estante', cantidad: 1, kgUnidad: 7.851, precioKg: 5.6, espesorMm: 1.5 },
    ], { ...sinProcesos, plegados: 4 }, T, 6)
    assert.equal(r.kgTotal, 26.31)
    assert.equal(r.costeMaterial, 147.34)
    assert.equal(r.costeUnidad, 153.34)
    assert.equal(r.precioUnidad, 199.34)
    assert.equal(r.precioLote, 1196.04)
    assert.deepEqual(r.incompletos, [])
})

test('corte por tramo de espesor, soldadura MIG y galvanizado por kg', () => {
    assert.equal(eurCortePorMetro(T, 1.5), 1.2)
    assert.equal(eurCortePorMetro(T, 4), 3)
    assert.equal(eurCortePorMetro(T, 50), 15)
    const r = precioConjunto([{ nombre: 'Placa', cantidad: 1, kgUnidad: 10, precioKg: 1, espesorMm: 8 }], { ...sinProcesos, corte_metros: 2, soldadura_metros: 1, soldadura_tipo: 'MIG', acabado: 'galvanizado' }, { ...T, margen: 0 }, 1)
    assert.equal(r.costeUnidad, 10 + 2 * 5 + 12 + 9)
})

test('sin medidas o sin m² de acabado → queda marcado como incompleto (no se inventa)', () => {
    const r = precioConjunto([{ nombre: 'Pata', cantidad: 4, kgUnidad: 0, precioKg: 5.6 }], { ...sinProcesos, acabado: 'pulido' }, T, 1)
    assert.ok(r.incompletos.some(x => x.includes('Pata')))
    assert.ok(r.incompletos.some(x => x.includes('Acabado')))
})

test('ayudas: m² y perímetro de las chapas', () => {
    const els = [{ forma: 'chapa', medidas: { A: 1280, B: 780 }, cantidad: 1 }, { forma: 'tubo_rect', medidas: { A: 40, B: 40 }, cantidad: 4 }]
    assert.equal(m2Chapas(els), 1)
    assert.equal(perimetroChapas(els), 4.12)
})
