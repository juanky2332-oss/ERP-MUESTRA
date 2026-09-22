import { test } from 'node:test'
import assert from 'node:assert/strict'
import { volumenCm3, pesoKg, dimensionesBruto, medidaComercial, calcular, cicloSugerido, descripcionPieza, DIAMETROS_COMERCIALES, type EntradaCalculo } from './calculo.ts'
import { precioConMercado, ratioIndice, INDICES_REFERENCIA } from './materiales.ts'

const cerca = (a: number, b: number, tol = 0.005) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≈ ${b}`)

test('barra redonda Ø40×1000 de acero pesa 9,86 kg (tabla: 9,87 kg/m)', () => {
    cerca(pesoKg(volumenCm3('redonda', { D: 40, L: 1000 }, 7.85), 7.85), 9.865)
})

test('pletina 100×10×1000 acero = 7,85 kg', () => {
    cerca(pesoKg(volumenCm3('pletina', { A: 100, E: 10, L: 1000 }, 7.85), 7.85), 7.85)
})

test('hexágono 24 entre caras × 1 m acero ≈ 3,92 kg', () => {
    cerca(pesoKg(volumenCm3('hexagonal', { S: 24, L: 1000 }, 7.85), 7.85), 3.916)
})

test('tubo Ø60×5×1000 acero ≈ 6,78 kg', () => {
    cerca(pesoKg(volumenCm3('tubo', { D: 60, E: 5, L: 1000 }, 7.85), 7.85), 6.782)
})

test('tubo rectangular 40×40×2 acero ≈ 2,39 kg/m', () => {
    cerca(pesoKg(volumenCm3('tubo_rect', { A: 40, B: 40, E: 2, L: 1000 }, 7.85), 7.85), 2.386)
})

test('chapa de aluminio 1000×500×10 ≈ 13,55 kg', () => {
    cerca(pesoKg(volumenCm3('chapa', { A: 1000, B: 500, E: 10 }, 2.71), 2.71), 13.55)
})

test('angular 50×50×5 acero ≈ 3,73 kg/m', () => {
    cerca(pesoKg(volumenCm3('angular', { A: 50, B: 50, E: 5, L: 1000 }, 7.85), 7.85), 3.729)
})

test('perfil IPE 200 de 6 m = 134,4 kg en acero', () => {
    cerca(pesoKg(volumenCm3('perfil_std', { L: 6000 }, 7.85, { serie: 'IPE', talla: '200' }), 7.85), 134.4)
})

test('por peso conocido devuelve el mismo peso', () => {
    cerca(pesoKg(volumenCm3('peso', { P: 2.5 }, 2.71), 2.71), 2.5)
})

test('medida comercial al alza', () => {
    assert.equal(medidaComercial(43, DIAMETROS_COMERCIALES), 45)
    assert.equal(medidaComercial(40, DIAMETROS_COMERCIALES), 40)
})

test('bruto con creces y medida comercial', () => {
    const b = dimensionesBruto('redonda', { D: 40, L: 120 }, { seccion: 3, largo: 5, redondearComercial: true })
    assert.equal(b.D, 45)
    assert.equal(b.L, 125)
})

test('presupuesto de eje: material, corte, mecanizado, margen y barras', () => {
    const e: EntradaCalculo = {
        material: { densidad: 7.85, maquinabilidad: 1, viruta: 0.2 },
        precioKg: 2,
        forma: 'redonda',
        final: { D: 40, L: 120 },
        sobremedida: { seccion: 3, largo: 5, redondearComercial: true },
        cantidad: 10,
        kerf: 3,
        largoBarra: 3000,
        merma: 0,
        descontarViruta: false,
        operaciones: [{ id: '1', maquinaId: 'torno_cnc', nombre: 'Torno CNC', tarifa: 60, prepMin: 30, cicloMin: 6 }],
        tratamientos: [],
        otrosLote: 0,
        margen: 25,
    }
    const r = calcular(e)
    cerca(r.pesoBruto, 1.56)            // Ø45×125
    cerca(r.pesoNeto, 1.184)            // Ø40×120
    assert.equal(r.piezasPorBarra, 23)  // (3000+3)/(125+3)
    assert.equal(r.barras, 1)
    cerca(r.costeMecanizadoLote, 90)    // (30 + 6×10) min × 60 €/h
    cerca(r.precioLote, r.costeLote * 1.25)
    assert.ok(r.aprovechamiento > 70 && r.aprovechamiento < 80)
})

test('taladros restan peso a la pieza terminada', () => {
    const base: EntradaCalculo = { material: { densidad: 7.85, maquinabilidad: 1, viruta: 0 }, precioKg: 1, forma: 'chapa', final: { A: 100, B: 100, E: 10 }, sobremedida: { seccion: 0, largo: 0, redondearComercial: false }, cantidad: 1, kerf: 0, largoBarra: 0, merma: 0, descontarViruta: false, operaciones: [], tratamientos: [], otrosLote: 0, margen: 0 }
    const sin = calcular(base)
    const con = calcular({ ...base, taladros: [{ d: 10, prof: 10, n: 4 }] })
    cerca(sin.pesoNeto - con.pesoNeto, 0.0247)
})

test('tratamiento por kg respeta el mínimo', () => {
    const r = calcular({ material: { densidad: 7.85, maquinabilidad: 1, viruta: 0 }, precioKg: 0, forma: 'redonda', final: { D: 20, L: 50 }, sobremedida: { seccion: 0, largo: 0, redondearComercial: false }, cantidad: 2, kerf: 0, largoBarra: 0, merma: 0, descontarViruta: false, operaciones: [], tratamientos: [{ id: 't', nombre: 'Temple', unidad: 'kg', precio: 2, minimo: 45 }], otrosLote: 0, margen: 0 })
    assert.equal(r.costeTratamientosLote, 45)
})

test('ciclo sugerido crece con materiales difíciles', () => {
    const acero = cicloSugerido(100, 55, 1)!
    const inox = cicloSugerido(100, 55, 0.45)!
    assert.ok(inox > acero)
})

test('precio con mercado solo mueve la parte sensible', () => {
    const hoy = { ...INDICES_REFERENCIA, aluminio: INDICES_REFERENCIA.aluminio * 1.1 }
    assert.equal(precioConMercado(6.4, 'aluminio', 0.45, hoy), 6.69)
    assert.equal(precioConMercado(6.4, null, 0.45, hoy), 6.4)
    cerca(ratioIndice('laton', { ...INDICES_REFERENCIA })!, 1)
})

test('descripción de línea de presupuesto', () => {
    assert.equal(descripcionPieza('Eje', 'redonda', { D: 40, L: 120 }, 'Acero C45', 1.184), 'Eje · Ø40×120 mm · Acero C45 · 1,184 kg/ud')
})
