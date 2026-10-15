import { ObjectOrType }         from '@itrocks/class-type'
import { Type }                 from '@itrocks/class-type'
import { typeOf }               from '@itrocks/class-type'
import { Mysql as M }           from '@itrocks/mysql'
import { ReflectClass }         from '@itrocks/reflect'
import { ReflectProperty }      from '@itrocks/reflect'
import { SqlQuery }             from '@itrocks/sql-build'
import { Entity }               from '@itrocks/storage'
import { Identifier }           from '@itrocks/storage'
import { Options }              from '@itrocks/storage'
import { SearchType }           from '@itrocks/storage'
import { uniqueOf }             from '@itrocks/unique'
import { Connection }           from 'mariadb'
import { QueryOptions }         from 'mariadb'
import { Contextual }           from './contextual-connection'
import { Context }              from './contextual-connection'
import { ContextualConnection } from './contextual-connection'
import { MysqlMaintainer }      from './mysql-maintainer'
import { safeDriverErrorCode }  from './safe-error-code'

const UNIQUE_INDEX_ERROR_CODE = 'SCHEMA_UNIQUE_INDEX_MAINTENANCE_FAILED'

export class UniqueIndexMaintenanceError extends Error
{
	readonly code = UNIQUE_INDEX_ERROR_CODE

	constructor()
	{
		super('Unique index maintenance failed')
		this.name = 'UniqueIndexMaintenanceError'
	}
}

export class Mysql extends M
{
	declare connection?: ContextualConnection

	async connect()
	{
		return Contextual.prototype.applyTo(await super.connect() as ContextualConnection)
	}

	async deleteId<T extends object>(type: ObjectOrType<T>, id: any, property: keyof Entity<T> = 'id')
	{
		return this.withContext(type, () => super.deleteId(type, id, property))
	}

	async deleteRelatedId<T extends Entity>(object: T, property: keyof T, id: Identifier)
	{
		return this.withContext(object, () => super.deleteRelatedId(object, property, id))
	}

	async ensureUniqueIndexes(type: Type): Promise<void>
	{
		if (!this.hasUniqueIndexes(type)) return
		const connection = this.connection ?? await this.connect()
		const promises = connection.uniqueIndexPromises
		const current = promises.get(type)
		if (current) return current

		let maintenance: Promise<void>
		maintenance = Promise.resolve()
			.then(() => this.maintainUniqueIndexes(type, connection))
			.catch(error => {
				if (promises.get(type) === maintenance) promises.delete(type)
				console.warn('[@itrocks/mysql-maintainer] Unique index maintenance failed', {
					code:  safeDriverErrorCode(error),
					event: 'unique-index-preflight'
				})
				throw new UniqueIndexMaintenanceError()
			})
		promises.set(type, maintenance)
		return maintenance
	}

	private hasUniqueIndexes(type: Type)
	{
		return new ReflectClass(type).properties.some(property => uniqueOf(type, property.name) !== false)
	}

	async insert<T extends object>(object: T)
	{
		return this.withContext(object, async () => {
			await this.ensureUniqueIndexes(typeOf(object))
			return super.insert(object)
		})
	}

	async insertRelatedId<T extends Entity>(object: T, property: keyof T, id: Identifier)
	{
		return this.withContext(object, () => super.insertRelatedId(object, property, id))
	}

	protected async maintainUniqueIndexes(type: Type, connection: ContextualConnection)
	{
		const originalConnection = Object.create(connection) as Connection
		originalConnection.query = (<T = any>(sql: string | QueryOptions, values?: any) => {
			return connection.superQuery<T>(sql, values)
		}) as Connection['query']
		await new MysqlMaintainer(originalConnection).updateContextTables(type)
	}

	protected async querySelection<T extends object>(query: SqlQuery, types: readonly Type[]): Promise<T[]>
	{
		return this.withContext([...types], () => super.querySelection<T>(query, types))
	}

	async read<T extends object>(type: Type<T>, id: Identifier)
	{
		return this.withContext(type, () => super.read(type, id))
	}

	async readCollection<T extends object, PT extends object>(object: Entity<T>, property: keyof T, type?: Type<PT>)
	{
		type ??= new ReflectProperty(object, property).collectionType.elementType.type as Type<PT>
		return this.withContext([object, type], () => super.readCollection(object, property, type))
	}

	async readCollectionIds<T extends object, PT extends object>(object: Entity<T>, property: keyof T, type?: Type<PT>)
	{
		type ??= new ReflectProperty(object, property).collectionType.elementType.type as Type<PT>
		return this.withContext([object, type], () => super.readCollectionIds(object, property, type))
	}

	async readMultiple<T extends object>(type: Type<T>, ids: Identifier[])
	{
		return this.withContext(type, () => super.readMultiple(type, ids))
	}

	async search<T extends object>(type: Type<T>, search: SearchType<T> = {}, options?: Options): Promise<Entity<T>[]>
	{
		return this.withContext(type, () => super.search(type, search, options))
	}

	async update<T extends object>(object: Entity<T>)
	{
		return this.withContext(object, async () => {
			await this.ensureUniqueIndexes(typeOf(object))
			return super.update(object)
		})
	}

	private async withContext<T>(context: Context, operation: () => Promise<T>)
	{
		return (this.connection ?? await this.connect()).run(context, operation)
	}

}
