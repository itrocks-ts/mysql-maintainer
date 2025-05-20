import { Type }         from '@itrocks/class-type'
import { Connection }   from 'mariadb'
import { QueryOptions } from 'mariadb'
import { SqlError }     from 'mariadb'

export class Contextual
{

	context: (object|Type|Type[])[] = []

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
			console.log('contextual.query', sql, values)
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
			console.log('query', sql, values)
			console.log('throw', error)
			console.log('context', this.context)
			throw 'captured'
		}
	}

}

export type ContextualConnection = Connection & Contextual
