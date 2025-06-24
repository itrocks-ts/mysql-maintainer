import { KeyOf }                from '@itrocks/class-type'
import { ObjectOrType }         from '@itrocks/class-type'
import { Type }                 from '@itrocks/class-type'
import { Mysql as M }           from '@itrocks/mysql'
import { ReflectProperty }      from '@itrocks/reflect'
import { Entity }               from '@itrocks/storage'
import { Identifier }           from '@itrocks/storage'
import { SearchType }           from '@itrocks/storage'
import { Contextual }           from './contextual-connection'
import { ContextualConnection } from './contextual-connection'

export class Mysql extends M
{
	declare connection?: ContextualConnection

	async connect()
	{
		return Contextual.prototype.applyTo(await super.connect() as ContextualConnection)
	}

	async deleteId<T extends object>(type: ObjectOrType<T>, id: any, property: KeyOf<Entity<T>> = 'id')
	{
		const context = (this.connection ?? await this.connect()).context
		context.push(type)
		const result = await super.deleteId(type, id, property)
		context.pop()
		return result
	}

	async deleteRelatedId<T extends Entity>(object: T, property: KeyOf<T>, id: Identifier)
	{
		const context = (this.connection ?? await this.connect()).context
		context.push(object)
		const result = await super.deleteRelatedId(object, property, id)
		context.pop()
		return result
	}

	async insert<T extends object>(object: T)
	{
		const context = (this.connection ?? await this.connect()).context
		context.push(object)
		const result = await super.insert(object)
		context.pop()
		return result
	}

	async insertRelatedId<T extends Entity>(object: T, property: KeyOf<T>, id: Identifier)
	{
		const context = (this.connection ?? await this.connect()).context
		context.push(object)
		const result = await super.insertRelatedId(object, property, id)
		context.pop()
		return result
	}

	async read<T extends object>(type: Type<T>, id: Identifier)
	{
		const context = (this.connection ?? await this.connect()).context
		context.push(type)
		const result = await super.read(type, id)
		context.pop()
		return result
	}

	async readCollection<T extends object, PT extends object>(
		object:   Entity<T>,
		property: KeyOf<T>,
		type = new ReflectProperty(object, property).collectionType.elementType.type as Type<PT>
	) {
		const context = (this.connection ?? await this.connect()).context
		context.push([object, type])
		const result = await super.readCollection(object, property, type)
		context.pop()
		return result
	}

	async readCollectionIds<T extends object, PT extends object>(
		object:   Entity<T>,
		property: KeyOf<T>,
		type = new ReflectProperty(object, property).collectionType.elementType.type as Type<PT>
	) {
		const context = (this.connection ?? await this.connect()).context
		context.push([object, type])
		const result = await super.readCollectionIds(object, property, type)
		context.pop()
		return result
	}

	async readMultiple<T extends object>(type: Type<T>, ids: Identifier[])
	{
		const context = (this.connection ?? await this.connect()).context
		context.push(type)
		const result = await super.readMultiple(type, ids)
		context.pop()
		return result
	}

	async search<T extends object>(type: Type<T>, search: SearchType<T> = {}): Promise<Entity<T>[]>
	{
		const context = (this.connection ?? await this.connect()).context
		context.push(type)
		const result = await super.search(type, search)
		context.pop()
		return result
	}

	async update<T extends object>(object: Entity<T>)
	{
		const context = (this.connection ?? await this.connect()).context
		context.push(object)
		const result = await super.update(object)
		context.pop()
		return result
	}

}
