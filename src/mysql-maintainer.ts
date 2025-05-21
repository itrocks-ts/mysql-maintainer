import { ObjectOrType } from '@itrocks/class-type'
import { Type }         from '@itrocks/class-type'
import { typeOf }       from '@itrocks/class-type'
import { QueryOptions } from 'mariadb'
import { SqlError }     from 'mariadb'
import { Context }      from './contextual-connection'
import { Contextual }   from './contextual-connection'

export * from './mysql'

export class MysqlMaintainer
{

	constructor(public connection: Contextual)
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

	manageError(error: SqlError, context: Context, sql: string | QueryOptions, values: any[]): boolean
	{
		console.log('query', sql, values)
		console.log('throw', error)
		console.log('context', context)
		switch (error.code) {
			case 'ER_BAD_FIELD_ERROR':
			case 'ER_CANNOT_ADD_FOREIGN':
				return this.updateContextTables(context)
			case 'ER_CANT_CREATE_TABLE':
				return this.createImplicitTables(sql)
			case 'ER_NO_SUCH_TABLE':
				return this.createContextTables(context)
		}
		return false
	}

	updateContextTables(context: Context): boolean
	{
		const contexts: ObjectOrType[] = Array.isArray(context) ? context : [context]
		for (const context of contexts) {
			this.updateTable(typeOf(context))
		}
		return false
	}

	updateTable(type: Type): boolean
	{
		return false
	}

}
