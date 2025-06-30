import { ObjectOrType }    from '@itrocks/class-type'
import { Connection }      from 'mariadb'
import { QueryOptions }    from 'mariadb'
import { SqlError }        from 'mariadb'
import { MysqlMaintainer } from './mysql-maintainer'

const MANAGED_ERROR_CODES = ['ER_BAD_FIELD_ERROR', 'ER_CANNOT_ADD_FOREIGN', 'ER_CANT_CREATE_TABLE', 'ER_NO_SUCH_TABLE']

export type Context = ObjectOrType | ObjectOrType[]

export class Contextual implements Partial<Connection>
{

	context: Context[] = []

	superQuery: <T = any>(sql: string | QueryOptions, values?: any) => Promise<T> = () => new Promise(() => {})

	async applyTo(connection: ContextualConnection)
	{
		connection.context    = []
		connection.superQuery = connection.query
		connection.query      = Contextual.prototype.query
		return connection
	}

	async query<T = any>(sql: string | QueryOptions, values?: any): Promise<T>
	{
		try {
			return await this.superQuery<T>(sql, values)
		}
		catch (error) {
			if (
				!(error instanceof SqlError)
				|| !error.code
				|| !MANAGED_ERROR_CODES.includes(error.code)
			) {
				throw error
			}
			// @ts-ignore query applies to a Connection
			if (await new MysqlMaintainer(this).manageError(error, this.context[this.context.length - 1], sql, values)) {
				return this.query(sql, values)
			}
			throw error
		}
	}

}

export type ContextualConnection = Connection & Contextual
