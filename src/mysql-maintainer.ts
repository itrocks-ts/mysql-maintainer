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

		console.log('class table before normalize:')
		const classTable = new ReflectToTable().convert(type)
		console.dir(classTable, { depth: null })

		console.log('class table after normalize:')
		new MysqlToTable(this.connection).normalize(classTable)
		console.dir(classTable, { depth: null })

		console.log('mysql table:')
		const mysqlTable = await ((new MysqlToTable(this.connection)).convert(tableName))
		console.dir(mysqlTable, { depth: null })

		console.log('table diff:')
		const schemaDiff = new TableDiff(mysqlTable, classTable)
		console.dir(schemaDiff, { depth: null})

		const schemaDiffMysql = new SchemaDiffMysql()
		console.log(schemaDiffMysql.sql(schemaDiff, true))

		return false
	}

}
