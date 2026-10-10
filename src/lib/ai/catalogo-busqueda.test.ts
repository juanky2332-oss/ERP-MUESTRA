import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankingCatalogo } from './catalogo-busqueda.ts'

const CAT = [
    { nombre: 'Eje acero C45 Ø40 mm', referencia: 'EJE-C45-40' },
    { nombre: 'Hora de mecanizado CNC', referencia: 'MO-CNC' },
    { nombre: 'Hora de soldadura TIG', referencia: 'MO-TIG' },
    { nombre: 'Brida inoxidable 316 DN50', referencia: 'BRI-316-50' },
]

test('plurales, abreviaturas y sin tildes', () => {
    assert.equal(rankingCatalogo(CAT, 'bridas inox DN50')[0].referencia, 'BRI-316-50')
    assert.equal(rankingCatalogo(CAT, 'horas de mecanizado')[0].referencia, 'MO-CNC')
    assert.equal(rankingCatalogo(CAT, 'soldadura tig')[0].referencia, 'MO-TIG')
    assert.equal(rankingCatalogo(CAT, 'EJE-C45-40')[0].referencia, 'EJE-C45-40')
})

test('lo que no está no devuelve nada (no se fuerza una coincidencia)', () => {
    assert.equal(rankingCatalogo(CAT, 'tornillo allen M8').length, 0)
    assert.equal(rankingCatalogo(CAT, '').length, 0)
})
