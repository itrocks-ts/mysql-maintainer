import assert         from 'node:assert/strict'
import { test }       from 'node:test'
import { Contextual } from '../cjs/contextual-connection.js'

test('journalise une tentative utile sans SQL, message pilote ni valeur privée', () => {
	const connection   = new Contextual()
	const driverError  = {
		code:    'ER_NO_SUCH_TABLE',
		message: "Table 'test.private' does not exist; sql: INSERT secret-value"
	}
	const privateSql   = 'INSERT INTO private SET text = ? -- secret-value'
	const warnings     = []
	const originalWarn = console.warn
	console.warn = (...parameters) => warnings.push(parameters)
	try {
		assert.equal(connection.incrementErrorCount(privateSql, driverError), true)
	}
	finally {
		console.warn = originalWarn
	}

	assert.deepEqual(warnings, [[
		'[@itrocks/mysql-maintainer] Schema maintenance attempt',
		{ attempt: 1, code: 'ER_NO_SUCH_TABLE' }
	]])
	const serialized = JSON.stringify(warnings)
	assert.doesNotMatch(serialized, /INSERT INTO private/)
	assert.doesNotMatch(serialized, /does not exist/)
	assert.doesNotMatch(serialized, /secret-value/)
})

test('remplace un code pilote non conforme pour ne pas le journaliser', () => {
	const connection   = new Contextual()
	const privateValue = 'PRIVATE_SECRET_VALUE'
	const warnings     = []
	const originalWarn = console.warn
	console.warn = (...parameters) => warnings.push(parameters)
	try {
		connection.incrementErrorCount('SELECT 1', {
			code:    privateValue,
			message: 'driver error'
		})
	}
	finally {
		console.warn = originalWarn
	}

	assert.deepEqual(warnings, [[
		'[@itrocks/mysql-maintainer] Schema maintenance attempt',
		{ attempt: 1, code: 'UNKNOWN' }
	]])
	assert.doesNotMatch(JSON.stringify(warnings), new RegExp(privateValue))
})
