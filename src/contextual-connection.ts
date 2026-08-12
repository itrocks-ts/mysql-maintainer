import { ObjectOrType }    from '@itrocks/class-type'
import { Connection }      from 'mariadb'
import { QueryOptions }    from 'mariadb'
import { SqlError }        from 'mariadb'
import { DEBUG }           from './mysql-maintainer'
import { MysqlMaintainer } from './mysql-maintainer'

const MANAGED_ERROR_CODES = ['ER_BAD_FIELD_ERROR', 'ER_CANNOT_ADD_FOREIGN', 'ER_NO_SUCH_TABLE']

export type Context = ObjectOrType | ObjectOrType[]

export class Contextual implements Partial<Connection>
{

  [x: number]: (() => Promise<void>) | undefined

	contexts: Context[] = []

	errorCount: Record<string, Record<string, Array<number>>> = {}

	superQuery: <T = any>(sql: string | QueryOptions, values?: any) => Promise<T> = () => new Promise(() => {})

	async applyTo(connection: ContextualConnection)
	{
		connection.contexts            = []
		connection.errorCount          = {}
		connection.incrementErrorCount = Contextual.prototype.incrementErrorCount
		connection.isSqlError          = Contextual.prototype.isSqlError
		connection.superQuery          = connection.query
		connection.query               = Contextual.prototype.query
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
		this.errorCount[sql][error.message].push(new Date().getTime())
		console.log('incremented', this.errorCount[sql][error.message].length, ':', sql, error.message)
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
				&& await new MysqlMaintainer(this).manageError(error, this.contexts[this.contexts.length - 1], sql, values)
			) {
				return this.query(sql, values)
			}
			if (DEBUG) console.log('MAINTAINER: throw (2)', error)
			throw error
		}
	}

}

export type ContextualConnection = Connection & Contextual
