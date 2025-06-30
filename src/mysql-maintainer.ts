import { ObjectOrType }    from '@itrocks/class-type'
import { Type }            from '@itrocks/class-type'
import { typeOf }          from '@itrocks/class-type'
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

export * from './mysql'

export class MysqlMaintainer
{

	constructor(public connection: Connection)
	{
	}

	createImplicitTables(sql: string | QueryOptions)
	{
		return false
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
		console.log(sql)
		await this.connection.query(sql)

		return true
	}

	async manageError(error: SqlError, context: Context, sql: string | QueryOptions, values: any[])
	{
		console.log('query', sql, values)
		console.log('throw', error)
		console.log('context', context)
		switch (error.code) {
			case 'ER_BAD_FIELD_ERROR':
			case 'ER_CANNOT_ADD_FOREIGN':
				return await this.updateContextTables(context)
			case 'ER_CANT_CREATE_TABLE':
				return this.createImplicitTables(sql)
			case 'ER_NO_SUCH_TABLE':
				return this.updateContextTables(context)
		}
		return false
	}

	async updateContextTables(context: Context): Promise<boolean>
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

		console.dir(schemaDiff.additions, { depth: null })
		console.dir(schemaDiff.changes,   { depth: null })
		console.dir(schemaDiff.deletions, { depth: null })

		const schemaDiffMysql = new SchemaDiffMysql()
		const sql = schemaDiffMysql.sql(schemaDiff, true)

		await this.connection.query(sql)

		return true
	}

}
