import { File }          from '@itrocks/class-file'
import { fileURLToPath } from 'node:url'

export class UniqueRecord
{
	constructor(naturalKey = '')
	{
		this.naturalKey = naturalKey
	}
}

File(fileURLToPath(import.meta.url))(UniqueRecord)
