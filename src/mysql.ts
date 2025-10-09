import { KeyOf }                from '@itrocks/class-type'
import { ObjectOrType }         from '@itrocks/class-type'
import { Type }                 from '@itrocks/class-type'
import { Options }              from '@itrocks/storage'
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
		const contexts = (this.connection ?? await this.connect()).contexts
		contexts.push(type)
		const result = await super.deleteId(type, id, property)
		contexts.pop()
		return result
	}

	async deleteRelatedId<T extends Entity>(object: T, property: KeyOf<T>, id: Identifier)
	{
		const contexts = (this.connection ?? await this.connect()).contexts
		contexts.push(object)
		const result = await super.deleteRelatedId(object, property, id)
		contexts.pop()
		return result
	}

	async insert<T extends object>(object: T)
	{
		const contexts = (this.connection ?? await this.connect()).contexts
		contexts.push(object)
		const result = await super.insert(object)
		contexts.pop()
		return result
	}

	async insertRelatedId<T extends Entity>(object: T, property: KeyOf<T>, id: Identifier)
	{
		const contexts = (this.connection ?? await this.connect()).contexts
		contexts.push(object)
		const result = await super.insertRelatedId(object, property, id)
		contexts.pop()
		return result
	}

	async read<T extends object>(type: Type<T>, id: Identifier)
	{
		const contexts = (this.connection ?? await this.connect()).contexts
		contexts.push(type)
		const result = await super.read(type, id)
		contexts.pop()
		return result
	}

	async readCollection<T extends object, PT extends object>(
		object:   Entity<T>,
		property: KeyOf<T>,
		type = new ReflectProperty(object, property).collectionType.elementType.type as Type<PT>
	) {
		const contexts = (this.connection ?? await this.connect()).contexts
		contexts.push([object, type])
		const result = await super.readCollection(object, property, type)
		contexts.pop()
		return result
	}

	async readCollectionIds<T extends object, PT extends object>(
		object:   Entity<T>,
		property: KeyOf<T>,
		type = new ReflectProperty(object, property).collectionType.elementType.type as Type<PT>
	) {
		const contexts = (this.connection ?? await this.connect()).contexts
		contexts.push([object, type])
		const result = await super.readCollectionIds(object, property, type)
		contexts.pop()
		return result
	}

	async readMultiple<T extends object>(type: Type<T>, ids: Identifier[])
	{
		const contexts = (this.connection ?? await this.connect()).contexts
		contexts.push(type)
		const result = await super.readMultiple(type, ids)
		contexts.pop()
		return result
	}

	async search<T extends object>(type: Type<T>, search: SearchType<T> = {}, options?: Options): Promise<Entity<T>[]>
	{
		const contexts = (this.connection ?? await this.connect()).contexts
		contexts.push(type)
		const result = await super.search(type, search, options)
		contexts.pop()
		return result
	}

	async update<T extends object>(object: Entity<T>)
	{
		const contexts = (this.connection ?? await this.connect()).contexts
		contexts.push(object)
		const result = await super.update(object)
		contexts.pop()
		return result
	}

}
