import assert                          from 'node:assert/strict'
import { test }                        from 'node:test'
import mariadb                         from 'mariadb'
import { mysqlDependsOn }              from '@itrocks/mysql'
import { toColumn }                    from '@itrocks/rename'
import { Store }                       from '@itrocks/store'
import { storeOf }                     from '@itrocks/store'
import { Unique }                      from '@itrocks/store'
import { Mysql }                       from '../cjs/mysql-maintainer.js'
import { UniqueIndexMaintenanceError } from '../cjs/mysql-maintainer.js'
import { UniqueRecord }                from './unique-record.fixture.mjs'

const config = {
	database: process.env.ITROCKS_MYSQL_DATABASE,
	host:     process.env.ITROCKS_MYSQL_HOST,
	password: process.env.ITROCKS_MYSQL_PASSWORD,
	port:     Number(process.env.ITROCKS_MYSQL_PORT || 3306),
	user:     process.env.ITROCKS_MYSQL_USER
}

const suffix    = `${process.pid}_${Date.now()}`
const tableName = `maintainer_unique_${suffix}`
const indexName = `${tableName}_natural_key_unique`

Store(tableName)(UniqueRecord)
Unique()(UniqueRecord.prototype, 'naturalKey')
mysqlDependsOn({ columnOf: toColumn, storeOf })

class ObservedMysql extends Mysql
{
	maintenanceCalls = 0

	async maintainUniqueIndexes(type, connection)
	{
		this.maintenanceCalls ++
		return super.maintainUniqueIndexes(type, connection)
	}
}

test('répare réellement un index non unique avant écriture, coalesce et retente sans toucher aux doublons', async () => {
	for (const [name, value] of Object.entries(config)) {
		assert.ok(value, `Variable de connexion MariaDB manquante : ${name}`)
	}
	const administrative = await mariadb.createConnection({
		...config,
		allowPublicKeyRetrieval: true
	})
	const source = new ObservedMysql(config)
	try {
		await createLegacyTable(administrative)
		await source.connect()

		await Promise.all([
			source.insert(new UniqueRecord('concurrent-first')),
			source.insert(new UniqueRecord('concurrent-second'))
		])
		assert.equal(source.maintenanceCalls, 1)
		await assertUniqueIndex(administrative)

		await source.close()
		await administrative.query(
			`ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\`, ADD INDEX \`${indexName}\` (\`natural_key\`)`
		)
		await source.insert(new UniqueRecord('after-reconnect'))
		assert.equal(source.maintenanceCalls, 2)
		await assertUniqueIndex(administrative)

		await source.close()
		await administrative.query(`DROP TABLE \`${tableName}\``)
		await createLegacyTable(administrative)
		const privateSentinel = `private_duplicate_${suffix}`
		await administrative.query(
			`INSERT INTO \`${tableName}\` (\`natural_key\`) VALUES (?), (?)`,
			[privateSentinel, privateSentinel]
		)

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
			await assert.rejects(source.insert(new UniqueRecord('blocked-write')), error => {
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
		assert.equal(source.maintenanceCalls, 3)
		assert.doesNotMatch(JSON.stringify(output), new RegExp(privateSentinel))
		assert.equal(await count(administrative, 'blocked-write'), 0)
		assert.equal(await count(administrative, privateSentinel), 2)
		assert.equal(await total(administrative), 2)
		await assertNonUniqueIndex(administrative)

		await administrative.query(
			`DELETE FROM \`${tableName}\` WHERE \`natural_key\` = ? LIMIT 1`,
			[privateSentinel]
		)
		await source.insert(new UniqueRecord('retry-after-cleanup'))
		assert.equal(source.maintenanceCalls, 4)
		assert.equal(await count(administrative, privateSentinel), 1)
		await assertUniqueIndex(administrative)
	}
	finally {
		await source.close()
		await administrative.query(`DROP TABLE IF EXISTS \`${tableName}\``)
		await administrative.end()
	}
})

async function assertNonUniqueIndex(connection)
{
	assert.equal(await nonUnique(connection), 1)
}

async function assertUniqueIndex(connection)
{
	assert.equal(await nonUnique(connection), 0)
}

async function count(connection, value)
{
	const rows = await connection.query(
		`SELECT COUNT(*) count FROM \`${tableName}\` WHERE \`natural_key\` = ?`,
		[value]
	)
	return Number(rows[0].count)
}

async function createLegacyTable(connection)
{
	await connection.query(
		`CREATE TABLE \`${tableName}\` (
			\`id\` int unsigned NOT NULL AUTO_INCREMENT,
			\`natural_key\` varchar(255) NOT NULL,
			PRIMARY KEY (\`id\`),
			INDEX \`${indexName}\` (\`natural_key\`)
		)`
	)
}

async function nonUnique(connection)
{
	const rows = await connection.query(
		`SELECT NON_UNIQUE non_unique
		FROM information_schema.statistics
		WHERE table_schema = DATABASE()
		AND table_name = ?
		AND index_name = ?`,
		[tableName, indexName]
	)
	assert.equal(rows.length, 1)
	return Number(rows[0].non_unique)
}

async function total(connection)
{
	const rows = await connection.query(`SELECT COUNT(*) count FROM \`${tableName}\``)
	return Number(rows[0].count)
}
