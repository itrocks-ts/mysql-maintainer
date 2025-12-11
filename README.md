[![npm version](https://img.shields.io/npm/v/@itrocks/mysql-maintainer?logo=npm)](https://www.npmjs.org/package/@itrocks/mysql-maintainer)
[![npm downloads](https://img.shields.io/npm/dm/@itrocks/mysql-maintainer)](https://www.npmjs.org/package/@itrocks/mysql-maintainer)
[![GitHub](https://img.shields.io/github/last-commit/itrocks-ts/mysql-maintainer?color=2dba4e&label=commit&logo=github)](https://github.com/itrocks-ts/mysql-maintainer)
[![issues](https://img.shields.io/github/issues/itrocks-ts/mysql-maintainer)](https://github.com/itrocks-ts/mysql-maintainer/issues)
[![discord](https://img.shields.io/discord/1314141024020467782?color=7289da&label=discord&logo=discord&logoColor=white)](https://25.re/ditr)

# mysql-maintainer

Reactively maintains database structure by updating schema and retrying on MySQL errors.

*This documentation was written by an artificial intelligence and may contain errors or approximations.
It has not yet been fully reviewed by a human. If anything seems unclear or incomplete,
please feel free to contact the author of this package.*

## Installation

```bash
npm i @itrocks/mysql-maintainer
```

## Usage

`@itrocks/mysql-maintainer` provides two main entry points:

- the `Mysql` class, a drop‑in replacement for `@itrocks/mysql` that
  automatically keeps your MySQL/MariaDB schema in sync with your
  TypeScript models while you work with data;
- the `MysqlMaintainer` class, a lower‑level helper you can call
  directly when you want to create or update tables yourself.

In both cases, the package reacts to common MySQL errors
(`ER_BAD_FIELD_ERROR`, `ER_CANNOT_ADD_FOREIGN`, `ER_NO_SUCH_TABLE`) and
updates the database structure, then transparently retries the failed
query.

### Minimal example: automatic schema maintenance

```ts
import { Mysql } from '@itrocks/mysql-maintainer'
import { Entity } from '@itrocks/storage'

class User extends Entity<User>
{
  name  = ''
  email = ''
}

async function main() {
  const mysql = new Mysql({
    // Same connection options as @itrocks/mysql / mariadb
    host: 'localhost',
    user: 'root',
    database: 'demo',
  })

  // On first call, mysql-maintainer will create or update the
  // corresponding table based on the User class definition, then retry
  // the insert.
  await mysql.insert(new User().assign({ name: 'Alice', email: 'a@example.com' }))
}
```

You can continue using the `Mysql` instance as you would use
`@itrocks/mysql`: methods such as `read`, `search`, `update`, and
collection helpers are forwarded to the base implementation, while
`mysql-maintainer` keeps track of the involved entities and adjusts the
schema when needed.

### Example: maintaining join tables on collection access

When you read many‑to‑many relationships defined as collections on your
entities, `Mysql` automatically creates or updates the implicit join
table.

```ts
import { Mysql }   from '@itrocks/mysql-maintainer'
import { Entity }  from '@itrocks/storage'

class Tag extends Entity<Tag>
{
  name = ''
}

class Article extends Entity<Article>
{
  title = ''

  // Many-to-many with Tag; the framework will map this to a join table
  tags: Tag[] = []
}

async function loadArticleTags(id: number) {
  const mysql = new Mysql({ database: 'demo' })

  const article = await mysql.read(Article, id)

  // If the join table does not exist yet or is out of date, it will be
  // created/updated before the query is retried.
  const tags = await mysql.readCollection(article, 'tags')
  return tags
}
```

### Example: using MysqlMaintainer directly

If you want to control when schema updates happen (for instance during a
deployment step or a migration command), you can work with
`MysqlMaintainer` and a `mariadb` connection.

```ts
import { createConnection } from 'mariadb'
import { MysqlMaintainer }  from '@itrocks/mysql-maintainer'
import { Entity }           from '@itrocks/storage'

class Product extends Entity<Product>
{
  name  = ''
  price = 0
}

async function ensureSchema() {
  const connection     = await createConnection({ database: 'demo' })
  const schemaManager  = new MysqlMaintainer(connection)

  // Create or update the table corresponding to Product
  await schemaManager.updateTable(Product)

  await connection.end()
}
```

## API

### `class Mysql extends @itrocks/mysql.Mysql`

Enhanced MySQL storage class that automatically tracks the context of
operations and lets `MysqlMaintainer` react to schema‑related errors.

Aside from the behavior described below, it exposes the same public API
as `@itrocks/mysql.Mysql`.

#### Properties

- `connection?: ContextualConnection` – the underlying `mariadb`
  connection wrapped with additional context information. You normally
  do not interact with it directly.

#### Methods

All methods have the same signature and return types as in
`@itrocks/mysql.Mysql`; the extra behavior is that each call pushes the
relevant entity type or instance to an internal context stack before the
query, and pops it afterwards.

- `async connect(): Promise<ContextualConnection>`

  Opens the connection and installs the contextual behavior so that
  errors can trigger schema maintenance.

- `async insert<T extends object>(object: T): Promise<Entity<T>>`

  Inserts a new row for `object`. If a “table does not exist” or
  “column not found / foreign key failed” error occurs, the
  corresponding table (and, for collections, the join table) is created
  or updated and the query is retried.

- `async update<T extends object>(object: Entity<T>): Promise<Entity<T>>`

  Updates an existing row; schema maintenance/automatic retry applies in
  the same way as for `insert`.

- `async deleteId<T extends object>(type: ObjectOrType<T>, id: any, property?: KeyOf<Entity<T>>): Promise<void>`

  Deletes a row by its identifier; the entity `type` is used as context
  for potential schema updates.

- `async deleteRelatedId<T extends Entity>(object: T, property: KeyOf<T>, id: Identifier): Promise<void>`

  Deletes a related entity (for example from a collection association).

- `async read<T extends object>(type: Type<T>, id: Identifier): Promise<Entity<T> | undefined>`

  Reads a single entity instance by identifier.

- `async readMultiple<T extends object>(type: Type<T>, ids: Identifier[]): Promise<Entity<T>[]>`

  Reads several entities by their identifiers.

- `async readCollection<T extends object, PT extends object>(object: Entity<T>, property: KeyOf<T>, type?: Type<PT>): Promise<Entity<PT>[]>`

  Reads a collection relationship (for example `article.tags`). The
  context includes both the owning object and the related type so that
  the implicit join table can be created or updated if necessary.

- `async readCollectionIds<T extends object, PT extends object>(object: Entity<T>, property: KeyOf<T>, type?: Type<PT>): Promise<Identifier[]>`

  Same as `readCollection`, but only retrieves identifiers.

- `async search<T extends object>(type: Type<T>, search?: SearchType<T>, options?: Options): Promise<Entity<T>[]>`

  Searches entities; the entity `type` becomes the context for schema
  maintenance.

### `class MysqlMaintainer`

Low‑level utility that knows how to translate your TypeScript entity
definitions (via reflection and schema packages) into MySQL tables and
how to react to common schema‑related errors.

#### Constructor

```ts
const maintainer = new MysqlMaintainer(connection)
```

- `connection` – a `mariadb` `Connection` used to inspect and modify the
  database schema.

#### Methods

- `async createImplicitTable(type1: ObjectOrType, type2: ObjectOrType): Promise<boolean>`

  Creates a join table between the two entity types, with a composite
  primary key and cascading foreign keys. Returns `true` once the table
  has been created.

- `async createTable(type: Type): Promise<boolean>`

  Creates a table corresponding to the given entity `type`. Throws if no
  table name can be resolved for the type.

- `implicitTableName(type1: ObjectOrType, type2: ObjectOrType): string`

  Returns the name of the join table that would be used for a
  many‑to‑many association between `type1` and `type2`. Throws if one of
  the types is not mapped to a table.

- `async manageError(error: SqlError, context: Context, sql: string | QueryOptions, values: any[]): Promise<boolean>`

  Examines the MySQL error and, when it corresponds to a managed error
  code, updates the tables for the provided `context` (entity type,
  instance, or pair `[owner, relatedType]`). Returns `true` if the error
  has been handled and the caller should retry the query, `false`
  otherwise.

- `async updateContextTables(context: Context, tableName?: string): Promise<boolean>`

  Internal helper that inspects the database to see whether the table
  for each context entity already exists. If not, it calls
  `createTable`; otherwise it calls `updateTable`. When two contexts are
  provided and their implicit join table matches `tableName`, the join
  table is also created.

- `async updateTable(type: Type): Promise<boolean>`

  Computes the difference between the current MySQL table and the table
  that should exist according to the entity `type`, then applies the
  required SQL changes. Returns `true` when a change has been applied,
  `false` when the schema was already up to date.

## Typical use cases

- Rapid prototyping: evolve your TypeScript entity models and let
  `mysql-maintainer` adjust the database schema on the fly while you
  insert, update, or query data.
- Developer workstations and test environments where automatic schema
  updates remove the need for manual migrations.
- Applications with many small deployments where you prefer incremental
  schema evolution handled by the application itself.
- Projects using the `@itrocks/storage` / `@itrocks/mysql` stack that
  want schema maintenance without writing migration scripts.
- Custom migration tools or CLI scripts built on top of
  `MysqlMaintainer` to validate and update schema before a new version
  of the application is started.
