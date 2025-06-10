import { ObjectOrType }    from '@itrocks/class-type'
import { Connection }      from 'mariadb'
import { QueryOptions }    from 'mariadb'
import { SqlError }        from 'mariadb'
import { MysqlMaintainer } from './mysql-maintainer'

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
				|| !['ER_BAD_FIELD_ERROR'].includes(error.code)
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
