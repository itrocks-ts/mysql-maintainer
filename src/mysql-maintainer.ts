import { ObjectOrType }    from '@itrocks/class-type'
import { Type }            from '@itrocks/class-type'
import { typeOf }          from '@itrocks/class-type'
import { MysqlToTable }    from '@itrocks/mysql-to-schema'
import { ReflectToTable }  from '@itrocks/reflect-to-schema'
import { TableDiff }       from '@itrocks/schema-diff'
import { SchemaDiffMysql } from '@itrocks/schema-diff-mysql'
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

	createContextTables(context: Context): boolean
	{
		const contexts: ObjectOrType[] = Array.isArray(context) ? context : [context]
		for (const context of contexts) {
			this.createTable(typeOf(context))
		}
		return false
	}

	createImplicitTables(sql: string | QueryOptions): boolean
	{
		return false
	}

	createTable(type: Type): boolean
	{
		return false
	}

	async manageError(error: SqlError, context: Context, sql: string | QueryOptions, values: any[]): Promise<boolean>
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
				return this.createContextTables(context)
		}
		return false
	}

	async updateContextTables(context: Context): Promise<boolean>
	{
		const contexts: ObjectOrType[] = Array.isArray(context) ? context : [context]
		for (const context of contexts) {
			await this.updateTable(typeOf(context))
		}
		return false
	}

	async updateTable(type: Type): Promise<boolean>
	{
		const tableName = storeOf(type)
		if (!tableName) {
			throw 'No table name for type'
		}
		console.log('##### UPDATE TABLE')

		const classTable = new ReflectToTable().convert(type)
		new MysqlToTable(this.connection).normalize(classTable)
		const mysqlTable = await ((new MysqlToTable(this.connection)).convert(tableName))

		const schemaDiff = new TableDiff(mysqlTable, classTable)

		console.log('##### Additions:')
		console.dir(schemaDiff.additions, { depth: null})
		console.log('##### Changes:')
		console.dir(schemaDiff.changes, { depth: null})
		console.log('##### Deletions:')
		console.dir(schemaDiff.deletions, { depth: null})

		const schemaDiffMysql = new SchemaDiffMysql()
		const sql = schemaDiffMysql.sql(schemaDiff, true)
		console.log(sql)

		await this.connection.query(sql)

		return false
	}

}
