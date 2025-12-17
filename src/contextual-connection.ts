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

	contexts: Context[] = []

	superQuery: <T = any>(sql: string | QueryOptions, values?: any) => Promise<T> = () => new Promise(() => {})

	async applyTo(connection: ContextualConnection)
	{
		connection.contexts   = []
		connection.superQuery = connection.query
		connection.query      = Contextual.prototype.query
		return connection
	}

	async query<T = any>(sql: string | QueryOptions, values?: any): Promise<T>
	{
		try {
			if (DEBUG) console.log(sql, values)
			return await this.superQuery<T>(sql, values)
		}
		catch (error) {
			if (
				!(error instanceof SqlError)
				|| !error.code
				|| !MANAGED_ERROR_CODES.includes(error.code)
			) {
				if (DEBUG) console.log('MAINTAINER: throw', error)
				throw error
			}
			// @ts-ignore query applies to a Connection
			if (await new MysqlMaintainer(this).manageError(error, this.contexts[this.contexts.length - 1], sql, values)) {
				return this.query(sql, values)
			}
			throw error
		}
	}

}

export type ContextualConnection = Connection & Contextual
