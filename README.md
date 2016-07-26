# Screwdriver Models
[![Version][npm-image]][npm-url] ![Downloads][downloads-image] [![Build Status][wercker-image]][wercker-url] [![Open Issues][issues-image]][issues-url] [![Dependency Status][daviddm-image]][daviddm-url] ![License][license-image]

> Screwdriver models

## Usage

```bash
npm install screwdriver-models
```
### Platform Model
```js
'use strict';
const Model = require('screwdriver-models');
const Platform = new Model.Platform(datastore);
const config = {
    page: 2,
    count: 3
}

Platform.list(config, (err, result) => {
    if (!err) {
        console.log(result);
    }
});
```

#### Create
Create a new platform
```
create(config, callback)
```

| Parameter        | Type  | Required | Description |
| :-------------   | :---- | :---- | :-------------|
| config        | Object | Yes | Configuration Object |
| config.name | String | Yes | Platform name |
| config.version | String | Yes | Platform version |
| config.config | String | No | Config of the platform |
| config.author | String | No | Author of the platform |
| config.scmUrl | String | No | Source Code URL for Screwdriver configuration |
| config.docUrl | String | No | Doc URL of platform |
| config.experimental | Boolean | No | Whether platform is experimental |
| callback | Function | Yes | Callback function fn(err, data) where data is the new platform that is created |

#### Get
Get a platform based on id
```
get(id, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| id | String | The unique ID for the platform |
| callback | Function | Callback function fn(err, result) where result is the platform object with the specific id|

#### List
List platforms with pagination
```
list(paginate, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| paginate        | Object | Pagination Object |
| paginate.page | Number | The page for pagination |
| paginate.count | Number | The count for pagination |
| callback | Function | Callback function fn(err, result) where result is an array of platforms |

#### Update
Update a specific platform
```
update(config, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| config        | Object | Configuration Object |
| config.id | String | The unique ID for the platform |
| config.data | String | The new data to update with |
| callback | Function | Callback function fn(err, result) where result is the new platform object |


### Pipeline Model
```js
'use strict';
const Model = require('screwdriver-models');
const Pipeline = new Model.Pipeline(datastore);
const config = {
    page: 2,
    count: 3
}

Pipeline.list(config, (err, result) => {
    if (!err) {
        console.log(result);
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
| callback | Function | Yes | Callback function fn(err, data) where data is the new pipeline that is created |

#### Get
Get a pipeline based on id
```
get(id, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| id | String | The unique ID for the pipeline |
| callback | Function | Callback function fn(err, result) where result is the pipeline with the specific id|

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
| callback | Function | Callback function fn(err, result) where result is an array of pipelines|

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
| callback | Function | Callback function fn(err, result) where result is the new pipeline object|

#### Sync
Sync the pipeline. Look up the configuration in the repo to create and delete jobs if necessary.
```
sync(config, callback)
```

| Parameter        | Type  | Required  |  Description |
| :-------------   | :---- | :---- | :-------------|
| config        | Object | Yes | Configuration Object |
| config.scmUrl | String | Yes | Source Code URL for the application |
| callback | Function | Yes | Callback function fn(err)|

### Job Model
```js
'use strict';
const Model = require('screwdriver-models');
const Job = new Model.Job(datastore);
const config = {
    page: 2,
    count: 3
}

Job.list(config, (err, result) => {
    if (!err) {
        console.log(result);
    }
});
```

#### Create
Create a new job
```
create(config, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| config        | Object | Configuration Object |
| config.pipelineId | String | The pipelineId that the job belongs to |
| config.name | String | The name of the job |
| callback | Function | Callback function fn(err, data) where data is the new job that is created|

#### Get
Get a job based on id
```
get(id, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| id | String | The unique ID for the job |
| callback | Function | Callback function fn(err, result) where result is the job object with the specific id|

#### List
List jobs with pagination
```
list(paginate, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| paginate        | Object | Pagination Object |
| paginate.page | Number | The page for pagination |
| paginate.count | Number | The count for pagination |
| callback | Function | Callback function fn(err, result) where result is an array of jobs |

#### Update
Update a specific job
```
update(config, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| config        | Object | Configuration Object |
| config.id | String | The unique ID for the job |
| config.data | String | The new data to update with |
| callback | Function | Callback function fn(err, result) where result is the new job object |


### Build Model
```js
'use strict';
const Model = require('screwdriver-models');
const Build = new Model.Build(datastore, executor);
const config = {
    page: 2,
    count: 3
}

Build.list(config, (err, result) => {
    if (!err) {
        console.log(result);
    }
});
```

#### Create
Create & start a new build
```
create(config, callback)
```

| Parameter        | Type  |  Required | Description |
| :-------------   | :---- | :-------------|  :-------------|
| config        | Object | Yes | Configuration Object |
| config.jobId | String | Yes | The unique ID for a job |
| config.container | String | No | Container for the build to run in |
| callback | Function | Yes | Callback function fn(err, data) where data is the new build that is created |

#### Get
Get a build based on id
```
get(id, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| id | String | The unique ID for the build |
| callback | Function | Callback function fn(err, result) where result is the build object with the specific id |

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
| callback | Function | Callback function fn(err, result) where result is an array of builds |

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
| callback | Function | Callback function fn(err, result) where result is the new build object |

#### Stream
Stream the log of a build
```
stream(config, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| config        | Object | Configuration Object |
| config.buildId | String | The unique ID for the build |
| callback | Function | Callback function fn(err, stream) where stream is a Readable stream|

### User Model
```js
'use strict';
const Model = require('screwdriver-models');
const Job = new Model.User(datastore, password);
const config = {
    username: 'myself',
    token: 'eyJksd3'            // User's github token
}

User.create(config, (err, user) => {
    if (!err) {
        console.log(user);
    }
});
```

#### Create
Create a new user
```
create(config, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| config        | Object | Configuration Object |
| config.username | String | The username |
| config.token | String | The user's github token|
| callback | Function | Callback function fn(err, data) where data is the new user that is created|


#### Get
Get a user based on id
```
get(id, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| id | String | The unique ID for the user |
| callback | Function | Callback function fn(err, result) where result is the user object with the specific id |


#### Update
Update a specific user
```
update(config, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| config        | Object | Configuration Object |
| config.id | String | The unique ID for the user |
| config.data | String | The new data to update with |
| callback | Function | Callback function fn(err, result) where result is the new user object |


#### Seal Token
Seal a token
```
sealToken(token, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| token | String | The token to seal |
| callback | Function | Callback function fn(err, sealed) where sealed is the sealed token |


#### Unseal Token
Unseal a token
```
unsealToken(sealed, callback)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| sealed | String | The token to unseal |
| callback | Function | Callback function fn(err, unsealed) where unsealed is the unsealed token |

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
