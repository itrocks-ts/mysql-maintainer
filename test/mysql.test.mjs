import assert                          from 'node:assert/strict'
import { setImmediate as immediate }   from 'node:timers/promises'
import { test }                        from 'node:test'
import { Store }                       from '@itrocks/store'
import { Unique }                      from '@itrocks/store'
import { Contextual }                  from '../cjs/contextual-connection.js'
import { Mysql }                       from '../cjs/mysql.js'
import { MysqlMaintainer }             from '../cjs/mysql-maintainer.js'
import { UniqueIndexMaintenanceError } from '../cjs/mysql-maintainer.js'

class PlainRecord
{
	constructor(value = '')
	{
		this.value = value
	}
}

Store('plain_record')(PlainRecord)

class OtherPlainRecord
{
	constructor(value = '')
	{
		this.value = value
	}
}

Store('other_plain_record')(OtherPlainRecord)

class UniqueRecord
{
	constructor(key = '')
	{
		this.key = key
	}
}

Store('unique_record')(UniqueRecord)
Unique()(UniqueRecord.prototype, 'key')

class OtherUniqueRecord
{
	constructor(key = '')
	{
		this.key = key
	}
}

Store('other_unique_record')(OtherUniqueRecord)
Unique()(OtherUniqueRecord.prototype, 'key')

class ControlledMysql extends Mysql
{
	maintenance = async () => {}
	maintenanceCalls = []

	async maintainUniqueIndexes(type, connection)
	{
		this.maintenanceCalls.push({ connection, type })
		await this.maintenance(type, connection)
	}
}

function dataSource(connection)
{
	const source = new ControlledMysql({ database: '', host: '', password: '', user: '' })
	source.connection = connection
	return source
}

async function fakeConnection(query = async sql => {
	return sql.startsWith('INSERT') ? { insertId: 1 } : []
}) {
	return Contextual.prototype.applyTo({ query })
}

test('préflight paresseux uniquement pour les écritures de types @Unique', async () => {
	const writes     = []
	const connection = await fakeConnection(async sql => {
		writes.push(sql)
		return sql.startsWith('INSERT') ? { insertId: 1 } : []
	})
	const source = dataSource(connection)

	await source.insert(new PlainRecord('public'))
	assert.equal(source.maintenanceCalls.length, 0)

	await source.insert(new UniqueRecord('first'))
	assert.equal(source.maintenanceCalls.length, 1)
	assert.equal(source.maintenanceCalls[0].type, UniqueRecord)

	const other = new OtherUniqueRecord('second')
	other.id = 2
	await source.update(other)
	assert.equal(source.maintenanceCalls.length, 2)
	assert.equal(source.maintenanceCalls[1].type, OtherUniqueRecord)
	assert.equal(writes.filter(sql => sql.startsWith('INSERT')).length, 2)
	assert.equal(writes.filter(sql => sql.startsWith('UPDATE')).length, 1)
})

test('deux écritures concurrentes coalescent le préflight par type et connexion', async () => {
	let releaseMaintenance
	const maintenanceGate = new Promise(resolve => releaseMaintenance = resolve)
	const connection      = await fakeConnection()
	const source          = dataSource(connection)
	source.maintenance = () => maintenanceGate

	const firstWrite  = source.insert(new UniqueRecord('first'))
	const secondWrite = source.insert(new UniqueRecord('second'))
	await immediate()
	assert.equal(source.maintenanceCalls.length, 1)

	releaseMaintenance()
	await Promise.all([firstWrite, secondWrite])
	assert.equal(connection.contextStorage.getStore(), undefined)
})

test('deux classes écrites en concurrence conservent chacune leur contexte asynchrone', async () => {
	const observed = []
	let connection
	connection = await fakeConnection(async sql => {
		const before = connection.contextStorage.getStore()
		await immediate()
		observed.push({ after: connection.contextStorage.getStore(), before, sql })
		return { insertId: 1 }
	})
	const source = dataSource(connection)

	await Promise.all([
		source.insert(new PlainRecord('first')),
		source.insert(new OtherPlainRecord('second'))
	])

	assert.deepEqual(observed.map(({ after, before, sql }) => ({
		after:  after.constructor.name,
		before: before.constructor.name,
		table:  /`([^`]+)`/.exec(sql)[1]
	})).sort((left, right) => left.table.localeCompare(right.table)), [
		{ after: 'OtherPlainRecord', before: 'OtherPlainRecord', table: 'otherplainrecord' },
		{ after: 'PlainRecord', before: 'PlainRecord', table: 'plainrecord' }
	])
	assert.equal(connection.contextStorage.getStore(), undefined)
})

test('un préflight échoué ne fuit rien, bloque l’écriture puis peut être retenté', async () => {
	const privateSentinel = 'private-sentinel-value'
	const connection      = await fakeConnection()
	const source          = dataSource(connection)
	let attempt = 0
	source.maintenance = async () => {
		attempt ++
		if (attempt === 1) {
			throw Object.assign(new Error(`ALTER failed for ${privateSentinel}`), {
				code:   'ER_DUP_ENTRY',
				sql:    `ALTER TABLE secret ADD UNIQUE (${privateSentinel})`,
				values: [privateSentinel]
			})
		}
	}

	const output = []
	const originalConsole = {
		error: console.error,
		log:   console.log,
		warn:  console.warn
	}
	console.error = (...parameters) => output.push(parameters)
	console.log   = (...parameters) => output.push(parameters)
	console.warn  = (...parameters) => output.push(parameters)
	try {
		await assert.rejects(source.insert(new UniqueRecord(privateSentinel)), error => {
			assert.ok(error instanceof UniqueIndexMaintenanceError)
			assert.equal(error.code, 'SCHEMA_UNIQUE_INDEX_MAINTENANCE_FAILED')
			assert.equal(error.message, 'Unique index maintenance failed')
			assert.equal('cause' in error, false)
			return true
		})
	}
	finally {
		Object.assign(console, originalConsole)
	}

	assert.equal(source.maintenanceCalls.length, 1)
	assert.equal(connection.contextStorage.getStore(), undefined)
	assert.deepEqual(output, [[
		'[@itrocks/mysql-maintainer] Unique index maintenance failed',
		{ code: 'ER_DUP_ENTRY', event: 'unique-index-preflight' }
	]])
	assert.doesNotMatch(JSON.stringify(output), new RegExp(privateSentinel))

	await source.insert(new UniqueRecord('retry'))
	assert.equal(source.maintenanceCalls.length, 2)
})

test('le cache est distinct par connexion et réinitialisé par contextualisation', async () => {
	const firstConnection  = await fakeConnection()
	const secondConnection = await fakeConnection()
	const source           = dataSource(firstConnection)

	await source.ensureUniqueIndexes(UniqueRecord)
	await source.ensureUniqueIndexes(UniqueRecord)
	assert.equal(source.maintenanceCalls.length, 1)

	source.connection = secondConnection
	await source.ensureUniqueIndexes(UniqueRecord)
	assert.equal(source.maintenanceCalls.length, 2)
	assert.deepEqual(source.maintenanceCalls.map(call => call.connection), [firstConnection, secondConnection])
})

test('la maintenance structurelle utilise exclusivement la requête pilote originale', async () => {
	const rawQueries = []
	const connection = await fakeConnection(async sql => {
		rawQueries.push(sql)
		return []
	})
	connection.query = async () => {
		throw new Error('La requête contextualisée ne doit pas être appelée')
	}
	const source = new Mysql({ database: '', host: '', password: '', user: '' })
	source.connection = connection

	const originalUpdate = MysqlMaintainer.prototype.updateContextTables
	MysqlMaintainer.prototype.updateContextTables = async function(type) {
		assert.equal(type, UniqueRecord)
		await this.connection.query('RAW SCHEMA PREFLIGHT')
		return true
	}
	try {
		await source.ensureUniqueIndexes(UniqueRecord)
	}
	finally {
		MysqlMaintainer.prototype.updateContextTables = originalUpdate
	}
	assert.deepEqual(rawQueries, ['RAW SCHEMA PREFLIGHT'])
})

test('le contexte est retiré quand une opération SQL échoue', async () => {
	const connection = await fakeConnection(async () => {
		throw new Error('driver failure')
	})
	const source = dataSource(connection)

	await assert.rejects(source.deleteId(PlainRecord, 1), /driver failure/)
	assert.equal(connection.contextStorage.getStore(), undefined)
})
