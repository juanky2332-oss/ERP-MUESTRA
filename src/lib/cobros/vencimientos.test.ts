import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularVencimiento, diasHastaVencimiento, infoCobro, describirCondicion } from './vencimientos.ts'

test('transferencia a 30, 60 y 90 días', () => {
    assert.equal(calcularVencimiento('2026-09-22', { tipo: 'dias', dias: 30 }), '2026-10-22')
    assert.equal(calcularVencimiento('2026-09-22', { tipo: 'dias', dias: 60 }), '2026-11-21')
    assert.equal(calcularVencimiento('2026-09-22', { tipo: 'dias', dias: 90 }), '2026-12-21')
})

test('pago inmediato vence el mismo día', () => {
    assert.equal(calcularVencimiento('2026-09-22', { tipo: 'inmediato' }), '2026-09-22')
})

test('día fijo del mes siguiente', () => {
    assert.equal(calcularVencimiento('2026-09-22', { tipo: 'dia_fijo', diaMes: 5, meses: 1 }), '2026-10-05')
    assert.equal(calcularVencimiento('2026-09-22', { tipo: 'dia_fijo', diaMes: 15, meses: 1 }), '2026-10-15')
})

test('día fijo tras varios meses y cambio de año', () => {
    assert.equal(calcularVencimiento('2026-11-10', { tipo: 'dia_fijo', diaMes: 10, meses: 3 }), '2027-02-10')
})

test('día fijo 31 en un mes corto se ajusta al último día', () => {
    assert.equal(calcularVencimiento('2027-01-15', { tipo: 'dia_fijo', diaMes: 31, meses: 1 }), '2027-02-28')
})

test('día fijo en el mismo mes (meses = 0)', () => {
    assert.equal(calcularVencimiento('2026-09-03', { tipo: 'dia_fijo', diaMes: 15, meses: 0 }), '2026-09-15')
    assert.equal(calcularVencimiento('2026-09-22', { tipo: 'dia_fijo', diaMes: 15, meses: 0 }), '2026-10-15')
})

test('fin de mes y días + fin de mes', () => {
    assert.equal(calcularVencimiento('2026-09-22', { tipo: 'fin_mes' }), '2026-09-30')
    assert.equal(calcularVencimiento('2026-09-22', { tipo: 'fin_mes', dias: 30 }), '2026-10-31')
    assert.equal(calcularVencimiento('2028-01-31', { tipo: 'fin_mes', dias: 29 }), '2028-02-29')
})

test('manual y sin vencimiento no calculan fecha', () => {
    assert.equal(calcularVencimiento('2026-09-22', { tipo: 'manual' }), null)
    assert.equal(calcularVencimiento('2026-09-22', { tipo: 'sin_vencimiento' }), null)
})

test('sin condición definida se usa 30 días', () => {
    assert.equal(calcularVencimiento('2026-09-22', null), '2026-10-22')
})

test('acepta timestamps y se queda con la fecha', () => {
    assert.equal(calcularVencimiento('2026-09-22T22:00:00.000Z', { tipo: 'dias', dias: 1 }), '2026-09-23')
})

test('días hasta vencimiento', () => {
    assert.equal(diasHastaVencimiento('2026-09-25', '2026-09-22'), 3)
    assert.equal(diasHastaVencimiento('2026-09-10', '2026-09-22'), -12)
    assert.equal(diasHastaVencimiento('2026-09-22', '2026-09-22'), 0)
})

test('estado visual: vencida, parcial, pagada y saldo', () => {
    const hoy = '2026-09-22'
    const vencida = infoCobro({ total: 1210, importe_cobrado: 300, estado_cobro: 'parcial', fecha_vencimiento: '2026-09-10' }, hoy)
    assert.equal(vencida.pendiente, 910)
    assert.equal(vencida.visual, 'vencida')
    assert.equal(vencida.etiqueta, 'Vencida hace 12 días')

    const pronto = infoCobro({ total: 500, importe_cobrado: 0, estado_cobro: 'pendiente', fecha_vencimiento: '2026-09-25' }, hoy)
    assert.equal(pronto.visual, 'pronto')

    const pagada = infoCobro({ total: 1000, importe_cobrado: 1000, estado_cobro: 'pagada', fecha_vencimiento: '2026-09-01' }, hoy)
    assert.equal(pagada.visual, 'pagada')
    assert.equal(pagada.pendiente, 0)

    const varios = infoCobro({ total: 1000, importe_cobrado: 600, estado_cobro: 'parcial', fecha_vencimiento: '2026-12-01' }, hoy)
    assert.equal(varios.pendiente, 400)
    assert.equal(varios.estado, 'parcial')
})

test('facturas antiguas marcadas solo con pagada=true cuentan como cobradas', () => {
    const f = infoCobro({ total: 200, pagada: true, fecha_vencimiento: null }, '2026-09-22')
    assert.equal(f.estado, 'pagada')
})

test('descripción de condiciones', () => {
    assert.equal(describirCondicion({ tipo: 'dias', dias: 60 }, 'transferencia'), 'Transferencia a 60 días desde fecha de factura')
    assert.equal(describirCondicion({ tipo: 'dia_fijo', diaMes: 5, meses: 1 }), 'Día 5 del mes siguiente')
})
