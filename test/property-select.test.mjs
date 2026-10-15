import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { Mysql } = require('@itrocks/mysql-maintainer')
const { sqlBuildDependsOn } = require('@itrocks/sql-build')
const { sqlJoinDependsOn } = require('@itrocks/sql-join')
const { Contextual } = require('../cjs/contextual-connection.js')
class Related
{}

class Root
{}
const columns = new Map([[Root, { related: { target: Related }, name: {} }], [Related, { name: {} }]])
for (const [type, definitions] of columns) for (const [name, property] of Object.entries(definitions)) {
	Object.assign(property, { name, class: { type } })
}
sqlJoinDependsOn({ tableOf: type => type.name, columnDefinitionsOf: type => columns.get(type) })
sqlBuildDependsOn({ columnOf: property => property.name })

test('projection and count retain all related maintenance contexts during concurrent queries', async () => {
	const observed = []
	const connection = await Contextual.prototype.applyTo({ query: async function(sql) {
		await new Promise(resolve => setTimeout(resolve, sql.includes('COUNT') ? 2 : 5))
		observed.push({ context: this.contextStorage.getStore(), sql })
		return sql.includes('COUNT') ? [{ count: 0 }] : []
	} })
	const dao = new Mysql({})
	dao.connection = connection
	await Promise.all([
		dao.select(Root, ['related.name']),
		dao.count(Root, { 'related.name': 'value' }),
		dao.select(Related, ['name'])
	])
	assert.equal(observed.length, 3)
	for (const { context, sql } of observed) {
		assert.deepEqual(context, sql.includes('`Root`') ? [Root, Related] : [Related])
	}
	assert.equal(connection.contextStorage.getStore(), undefined)
})

test('maintenance visits every graph type and resolves a link within a larger context', async () => {
	const { MysqlMaintainer } = require('@itrocks/mysql-maintainer')
	const { Store } = require('@itrocks/store')
	class Other
	{}
	Store('projection_root')(Root)
	Store('projection_related')(Related)
	Store('projection_other')(Other)
	const visited = []
	const links = []
	const maintainer = new MysqlMaintainer({ query: async () => [{}] })
	maintainer.updateTable = async type => { visited.push(type); return true }
	maintainer.createImplicitTable = async (left, right) => { links.push([left, right]); return true }
	await maintainer.updateContextTables([Root, Related, Other], 'projection_related_projection_root')
	assert.deepEqual(visited, [Root, Related, Other])
	assert.deepEqual(links, [[Root, Related]])
})
