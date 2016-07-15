# Screwdriver Models
[![Version][npm-image]][npm-url] ![Downloads][downloads-image] [![Build Status][wercker-image]][wercker-url] [![Open Issues][issues-image]][issues-url] [![Dependency Status][daviddm-image]][daviddm-url] ![License][license-image]

> Screwdriver models

## Usage

```bash
npm install screwdriver-models
```

### Pipeline Model
```js
'use strict';
const Model = require('screwdriver-models');

module.exports = (datastore) => ({
    method: 'GET',
    path: '/pipelines',
    config: {
        description: 'Get pipelines with pagination',
        notes: 'Returns all pipeline records',
        tags: ['api', 'pipelines'],
        handler: (request, reply) => {
            const Pipeline = new Model.Pipeline(datastore);
            Pipeline.list(request.query, reply);
        },
        response: {
            schema: listSchema
        },
        validate: {
            query: schema.pagination
        }
    }
});
```


#### Create
Create a pipeline & create a default job called `main`
```
create(config, callback)
```

| Parameter        | Type  | Required  |  Description |
| :-------------   | :---- | :---- | :-------------|
| config        | Object | Yes | Configuration Object |
| config.scmUrl | String | Yes | Source Code URL for the application |
| config.configUrl | String | No | Source Code URL for Screwdriver configuration |
| callback | Function | Yes | Callback function|

#### Get
Get a pipeline based on id
```
get(id, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| id | String | The unique ID for the pipeline |
| callback | Function | Callback function|

#### List
List builds with pagination
```
list(paginate, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| paginate        | Object | Pagination Object |
| paginate.page | Number | The page for pagination |
| paginate.count | Number | The count for pagination |
| callback | Function | Callback function |

#### Update
Update a specific pipeline
```
update(config, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| config        | Object | Configuration Object |
| config.id | String | The unique ID for the pipeline |
| config.data | String | The new data to update with |
| callback | Function | Callback function|

#### Sync
Sync the pipeline. Look up the configuration in the repo to create and delete jobs if necessary.
```
sync(config, callback)
```

| Parameter        | Type  | Required  |  Description |
| :-------------   | :---- | :---- | :-------------|
| config        | Object | Yes | Configuration Object |
| config.scmUrl | String | Yes | Source Code URL for the application |
| callback | Function | Yes | Callback function|

### Build Model
```js
'use strict';
const Model = require('screwdriver-models');

module.exports = (datastore) => ({
    method: 'GET',
    path: '/builds',
    config: {
        description: 'Get builds with pagination',
        notes: 'Returns all builds records',
        tags: ['api', 'builds'],
        handler: (request, reply) => {
            const Build = new Model.Build(datastore);
            Build.list(request.query, reply);
        },
        response: {
            schema: listSchema
        },
        validate: {
            query: schema.pagination
        }
    }
});
```

#### Create
Create & start a new build
```
create(config, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| config        | Object | Configuration Object |
| config.jobId | String | The unique ID for a job |
| config.container | String | Container for the build to run in |
| callback | Function | Callback function|

#### Get
Get a build based on id
```
get(id, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| id | String | The unique ID for the build |
| callback | Function | Callback function|

#### List
List builds with pagination
```
list(paginate, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| paginate        | Object | Pagination Object |
| paginate.page | Number | The page for pagination |
| paginate.count | Number | The count for pagination |
| callback | Function | Callback function |

#### Update
Update a specific build
```
update(config, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| config        | Object | Configuration Object |
| config.id | String | The unique ID for the build |
| config.data | String | The new data to update with |
| callback | Function | Callback function|

#### Stream
Stream the log of a build
```
stream(config, response)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| config        | Object | Configuration Object |
| config.buildId | String | The unique ID for the build |
| response | Object | The response object to stream to|

## Testing

```bash
npm test
```

## License

Code licensed under the BSD 3-Clause license. See LICENSE file for terms.

[npm-image]: https://img.shields.io/npm/v/screwdriver-models.svg
[npm-url]: https://npmjs.org/package/screwdriver-models
[downloads-image]: https://img.shields.io/npm/dt/screwdriver-models.svg
[license-image]: https://img.shields.io/npm/l/screwdriver-models.svg
[issues-image]: https://img.shields.io/github/issues/screwdriver-cd/models.svg
[issues-url]: https://github.com/screwdriver-cd/models/issues
[wercker-image]: https://app.wercker.com/status/b397acf533ad968db3955e1b2e834c8b
[wercker-url]: https://app.wercker.com/project/bykey/b397acf533ad968db3955e1b2e834c8b
[daviddm-image]: https://david-dm.org/screwdriver-cd/models.svg?theme=shields.io
[daviddm-url]: https://david-dm.org/screwdriver-cd/models
