import { ObjectOrType }    from '@itrocks/class-type'
import { Type }            from '@itrocks/class-type'
import { typeOf }          from '@itrocks/class-type'
import { joinTableName }   from '@itrocks/mysql'
import { MysqlToTable }    from '@itrocks/mysql-to-schema'
import { ReflectToTable }  from '@itrocks/reflect-to-schema'
import { TableDiff }       from '@itrocks/schema-diff'
import { SchemaDiffMysql } from '@itrocks/schema-diff-mysql'
import { SchemaToMysql }   from '@itrocks/schema-to-mysql'
import { storeOf }         from '@itrocks/store'
import { Connection }      from 'mariadb'
import { QueryOptions }    from 'mariadb'
import { SqlError }        from 'mariadb'
import { Context }         from './contextual-connection'

export { Mysql } from './mysql'

export const DEBUG = false

const DELETION = false

export class MysqlMaintainer
{

	constructor(public connection: Connection)
	{
	}

	async createImplicitTable(type1: ObjectOrType, type2: ObjectOrType)
	{
		const joinTable = this.implicitTableName(type1, type2)
		const table1    = storeOf(type1)
		const table2    = storeOf(type2)

		const query = `CREATE TABLE \`${joinTable}\` (
${table1}_id int unsigned NOT NULL,
${table2}_id int unsigned NOT NULL,
PRIMARY KEY (${table1}_id, ${table2}_id),
CONSTRAINT \`${joinTable}.${table1}_id\` FOREIGN KEY (${table1}_id) REFERENCES \`${table1}\` (id) ON DELETE CASCADE ON UPDATE CASCADE,
CONSTRAINT \`${joinTable}.${table2}_id\` FOREIGN KEY (${table2}_id) REFERENCES \`${table2}\` (id) ON DELETE CASCADE ON UPDATE CASCADE
)`
		await this.connection.query(query)

		return true
	}

	async createTable(type: Type)
	{
		const tableName = storeOf(type)
		if (!tableName) {
			throw 'No table name for type'
		}

		const tableSchema   = new ReflectToTable().convert(type)
		const schemaToMysql = new SchemaToMysql()
		const sql           = schemaToMysql.sql(tableSchema)
		await this.connection.query(sql)

		return true
	}

	implicitTableName(type1: ObjectOrType, type2: ObjectOrType)
	{
		const table1 = storeOf(type1)
		const table2 = storeOf(type2)
		if (!table1 || !table2) {
			throw 'Collection objects are not stored'
		}
		return joinTableName(table1, table2)
	}

	async manageError(error: SqlError, context: Context, sql: string | QueryOptions, values: any[])
	{
		if (DEBUG) console.log('MAINTAINER: manageError', error)
		switch (error.code) {
			case 'ER_BAD_FIELD_ERROR':
			case 'ER_CANNOT_ADD_FOREIGN':
				return await this.updateContextTables(context)
			case 'ER_NO_SUCH_TABLE':
				const tableName = /Table '.*?\.(.*?)'/.exec(error.message)?.[1]
				return this.updateContextTables(context, tableName)
		}
		return false
	}

	async updateContextTables(context: Context, tableName?: string): Promise<boolean>
	{
		const contexts: ObjectOrType[] = Array.isArray(context) ? context : [context]
		for (const context of contexts) {
			const type      = typeOf(context)
			const tableName = storeOf(type)
			if (!tableName) {
				throw 'No table name for type'
			}
			const exists = (await this.connection.query('SHOW TABLES LIKE ?', tableName)) as Array<any>
			await (exists.length ? this.updateTable(type) : this.createTable(type))
		}
		if ((contexts.length === 2) && (this.implicitTableName(contexts[0], contexts[1]) === tableName)) {
			await this.createImplicitTable(contexts[0], contexts[1])
		}
		return true
	}

	async updateTable(type: Type): Promise<boolean>
	{
		const tableName = storeOf(type)
		if (!tableName) {
			throw 'No table name for type'
		}

		const classTable = new ReflectToTable().convert(type)
		new MysqlToTable(this.connection).normalize(classTable)
		const mysqlTable = await ((new MysqlToTable(this.connection)).convert(tableName))

		const schemaDiff = new TableDiff(mysqlTable, classTable)

		if (
			!schemaDiff.additions.length
			&& !schemaDiff.changes.length
			&& (!schemaDiff.deletions.length || !DELETION)
			&& !schemaDiff.tableChanges()
		) {
			return false
		}

		const schemaDiffMysql = new SchemaDiffMysql()
		const sql = schemaDiffMysql.sql(schemaDiff, DELETION)

		await this.connection.query(sql)

		return true
	}

}
