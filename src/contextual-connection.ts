import { ObjectOrType }        from '@itrocks/class-type'
import { Type }                from '@itrocks/class-type'
import { Connection }          from 'mariadb'
import { QueryOptions }        from 'mariadb'
import { SqlError }            from 'mariadb'
import { AsyncLocalStorage }   from 'node:async_hooks'
import { DEBUG }               from './mysql-maintainer'
import { MysqlMaintainer }     from './mysql-maintainer'
import { safeDriverErrorCode } from './safe-error-code'

const MANAGED_ERROR_CODES = ['ER_BAD_FIELD_ERROR', 'ER_CANNOT_ADD_FOREIGN', 'ER_NO_SUCH_TABLE']

export type Context = ObjectOrType | ObjectOrType[]

export class Contextual implements Partial<Connection>
{

  [x: number]: (() => Promise<void>) | undefined

	contextStorage = new AsyncLocalStorage<Context>()

	errorCount: Record<string, Record<string, Array<number>>> = {}

	superQuery: <T = any>(sql: string | QueryOptions, values?: any) => Promise<T> = () => new Promise(() => {})

	uniqueIndexPromises = new WeakMap<Type, Promise<void>>()

	async applyTo(connection: ContextualConnection)
	{
		connection.contextStorage      = new AsyncLocalStorage()
		connection.errorCount          = {}
		connection.incrementErrorCount = Contextual.prototype.incrementErrorCount
		connection.isSqlError          = Contextual.prototype.isSqlError
		connection.run                 = Contextual.prototype.run
		connection.superQuery          = connection.query
		connection.query               = Contextual.prototype.query
		connection.uniqueIndexPromises = new WeakMap()
		return connection
	}

	incrementErrorCount(sql: string, error: any): this is Connection
	{
		if (!this.errorCount[sql]) {
			this.errorCount[sql] = {}
		}
		if (!this.errorCount[sql][error.message]) {
			this.errorCount[sql][error.message] = []
		}
		const errors = this.errorCount[sql][error.message]
		errors.push(new Date().getTime())
		console.warn('[@itrocks/mysql-maintainer] Schema maintenance attempt', {
			attempt: errors.length,
			code:    safeDriverErrorCode(error)
		})
		return true
	}

	isSqlError(error: any): error is SqlError
	{
		return (typeof error === 'object') && !!(error as SqlError).code
	}

	async query<T = any>(sql: string | QueryOptions, values?: any): Promise<T>
	{
		try {
			if (DEBUG) console.log(sql, values)
			return await this.superQuery<T>(sql, values)
		}
		catch (error) {
			if (!this.isSqlError(error) || !MANAGED_ERROR_CODES.includes(error.code!)) {
				if (DEBUG) console.log('MAINTAINER: throw', error)
				throw error
			}
			sql = (typeof sql === 'object') ? sql.sql : sql
			if (
				this.incrementErrorCount(sql, error)
				&& (this.errorCount[sql][error.message].length < 5)
				&& await new MysqlMaintainer(this).manageError(error, this.contextStorage.getStore()!, sql, values)
			) {
				return this.query(sql, values)
			}
			if (DEBUG) console.log('MAINTAINER: throw (2)', error)
			throw error
		}
	}

	run<T>(context: Context, operation: () => Promise<T>): Promise<T>
	{
		return this.contextStorage.run(context, operation)
	}

}

export type ContextualConnection = Connection & Contextual
