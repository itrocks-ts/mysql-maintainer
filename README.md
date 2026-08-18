[![npm version](https://img.shields.io/npm/v/@itrocks/mysql-maintainer?logo=npm)](https://www.npmjs.org/package/@itrocks/mysql-maintainer)
[![npm downloads](https://img.shields.io/npm/dm/@itrocks/mysql-maintainer)](https://www.npmjs.org/package/@itrocks/mysql-maintainer)
[![GitHub](https://img.shields.io/github/last-commit/itrocks-ts/mysql-maintainer?color=2dba4e&label=commit&logo=github)](https://github.com/itrocks-ts/mysql-maintainer)
[![issues](https://img.shields.io/github/issues/itrocks-ts/mysql-maintainer)](https://github.com/itrocks-ts/mysql-maintainer/issues)
[![discord](https://img.shields.io/discord/1314141024020467782?color=7289da&label=discord&logo=discord&logoColor=white)](https://25.re/ditr)

# mysql-maintainer

Reactively maintains database structure by updating schema and retrying on MySQL errors.

Connect this package to [`@itrocks/mysql`](https://github.com/itrocks-ts/mysql), then keep using your MySQL data
sources normally. Their database structure is maintained automatically, as operations need it, when persistent object
structures evolve. There are no migration files to write and no maintenance API to call.

## Use with the it.rocks framework

An application based on [`@itrocks/framework`](https://github.com/itrocks-ts/framework) needs the framework, the MySQL
data source, and this package:

```bash
npm i @itrocks/framework @itrocks/mysql @itrocks/mysql-maintainer
```

Add the composition and the main MySQL data source to the project's `config.yaml`:

```yaml
compose:
  '@itrocks/mysql:Mysql': '@itrocks/mysql-maintainer:Mysql'

dataSource:
  engine: '@itrocks/mysql'
  host: localhost
  user: application
  password: secret
  database: application
```

The `compose` entry enriches `@itrocks/mysql` with the automatic maintenance behaviour. It uses the standard
[`@itrocks/compose`](https://github.com/itrocks-ts/compose) mechanism for enriching one module with another module's
features.

The `dataSource` entry above configures the project's main data source. You can instead create other MySQL data sources
as described in the [`@itrocks/mysql` documentation](https://github.com/itrocks-ts/mysql). Every data source based on
the composed `@itrocks/mysql` implementation is maintained automatically.

That is the complete setup. Keep changing and using persistent object classes through the usual it.rocks storage
operations; the required database changes are applied when an operation first needs them.

## Use outside the it.rocks framework

The same integration principle can be used without `@itrocks/framework`:

1. Install [`@itrocks/mysql`](https://github.com/itrocks-ts/mysql) and a mixin-based composition system such as
   [`@itrocks/compose`](https://github.com/itrocks-ts/compose). A wrapper implementing the same API as `@itrocks/mysql`
   can be used instead.
2. Create the required `@itrocks/mysql` data sources as described in its
   [documentation](https://github.com/itrocks-ts/mysql). This package does not change how data sources are configured.
3. Install `@itrocks/mysql-maintainer` in the project.
4. Use the chosen composition system to enrich the `Mysql` implementation from `@itrocks/mysql` with the behaviour
   supplied by `@itrocks/mysql-maintainer`. Refer to the
   [`@itrocks/compose` documentation](https://github.com/itrocks-ts/compose) when using that package.
5. Use the MySQL data sources normally. Their operations now trigger automatic maintenance when the current database
   structure no longer supports the persistent object model.

The application integrator is responsible for performing the composition early enough and according to the chosen
composition system's loading rules.

## How it works

The package enriches the usual `Mysql` operations with the context required to identify the persistent classes involved.
It intercepts MySQL errors that indicate a missing or outdated table, column, or foreign key, derives the expected
schema from the object model, applies the required structural changes, and retries the original operation.

For example, a read follows this simplified sequence:

1. The application reads an object through a MySQL data source as usual.
2. The enriched data source records the class being read and executes the SQL query.
3. If MySQL reports a supported structure error, the maintainer compares the database with the schema derived from
   that class and updates the affected table or relationship table.
4. The data source retries the same query and returns the read result to the application.

The exported classes that implement context tracking, error handling, schema updates, and retries are internal
mechanics of this integration. They are not a separate API that an application needs to call.

## Persistent model requirements

Automatic maintenance derives database structure from business classes and their reflection metadata. Those classes
must follow the it.rocks persistent object conventions, including the decorators and metadata used by its ORM packages.

The current implementation is strongly coupled to the it.rocks ORM ecosystem. Its
[`npm dependencies`](https://www.npmjs.com/package/@itrocks/mysql-maintainer?activeTab=dependencies) show the
reflection, storage, schema conversion, and schema diff modules involved. Outside a full it.rocks application, the
integrator must provide a compatible model and metadata environment in addition to the MySQL and composition
integrations described above.
