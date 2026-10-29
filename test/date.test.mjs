import assert            from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test }          from 'node:test'

const require = createRequire(import.meta.url)
const { MysqlMaintainer } = require('../cjs/mysql-maintainer.js')
const { MysqlToTable } = require('@itrocks/mysql-to-schema')
const { ReflectToTable } = require('@itrocks/reflect-to-schema')
const { Column, Table, Type } = require('@itrocks/schema')
const { Store } = require('@itrocks/store')

class Record
{}
Store('dates')(Record)

test('maintenance replaces legacy NULL dates before changing date and datetime columns to NOT NULL', async () => {
	const previousReflect = ReflectToTable.prototype.convert
	const previousMysql = MysqlToTable.prototype.convert
	const column = (name, type, nullable, zero) => new Column(name, type, { canBeNull: nullable, default: zero })
	const source = new Table('dates', { columns: [
		column('date', Type.date({ length: 10 }), true, null),
		column('time', Type.dateTime({ length: 19 }), true, null)
	] })
	const target = new Table('dates', { columns: [
		column('date', Type.date(), false, '0000-00-00'),
		column('time', Type.dateTime(), false, '0000-00-00 00:00:00')
	] })
	const queries = []
	ReflectToTable.prototype.convert = () => target
	MysqlToTable.prototype.convert = async () => source
	try {
		const maintainer = new MysqlMaintainer({ query: async (sql, values) => { queries.push({ sql, values }) } })
		assert.equal(await maintainer.updateTable(Record), true)
		assert.deepEqual(queries.slice(0, 2), [
			{ sql: 'UPDATE `dates` SET `date` = ? WHERE `date` <=> NULL', values: ['0000-00-00'] },
			{ sql: 'UPDATE `dates` SET `time` = ? WHERE `time` <=> NULL', values: ['0000-00-00 00:00:00'] }
		])
		assert.match(queries[2].sql, /`date` date NOT NULL DEFAULT '0000-00-00'/)
		assert.match(queries[2].sql, /`time` datetime NOT NULL DEFAULT '0000-00-00 00:00:00'/)
		MysqlToTable.prototype.convert = async () => target
		assert.equal(await maintainer.updateTable(Record), false)
		assert.equal(queries.length, 3)
	}
	finally {
		ReflectToTable.prototype.convert = previousReflect
		MysqlToTable.prototype.convert = previousMysql
	}
})
