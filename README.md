# Screwdriver Models
[![Version][npm-image]][npm-url] ![Downloads][downloads-image] [![Build Status][wercker-image]][wercker-url] [![Open Issues][issues-image]][issues-url] [![Dependency Status][daviddm-image]][daviddm-url] ![License][license-image]
TOMATO
> Screwdriver models

## Usage
Asynchronous methods return promises.

```bash
npm install screwdriver-models
```

### Pipeline Factory
#### Search
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.PipelineFactory.getInstance({ datastore });
const config = {
    params: {
        configUrl: 'banana'
    },
    paginate {
        page: 2,
        count: 3
    }
}

factory.list(config).then(pipelines => {
    // Do stuff with list of pipelines
});
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| config        | Object | Config Object |
| config.paginate.page | Number | The page for pagination |
| config.paginate.count | Number | The count for pagination |
| config.params | Object | fields to search on |

#### Create
```js
factory.create(config).then(model => {
    // do stuff with pipeline model
});
```

| Parameter        | Type  | Required  |  Description |
| :-------------   | :---- | :---- | :-------------|
| config        | Object | Yes | Configuration Object |
| config.admins | Object | Yes | Admins for this pipeline, e.g { batman: true } |
| config.scmUrl | String | Yes | Source Code URL for the application |
| config.configUrl | String | No | Source Code URL for Screwdriver configuration |

#### Get
Get a pipeline based on id. Can pass the generatedId for the pipeline, or the unique keys for the model, and the id will be determined automatically.
```js
factory.get(id).then(model => {
    // do stuff with pipeline model
});

factory.get({ scmUrl }).then(model => {
    // do stuff with pipeline model
});
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| id | String | The unique ID for the pipeline |
| config.scmUrl | String | Source Code URL for the application |


### Pipeline Model

#### Update
Update a specific pipeline model
```
model.update()
```

Example:
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.PipelineFactory.getInstance({ datastore });
const scmUrl = 'git@git.corp.yahoo.com:foo/BAR.git';
factory.get({ scmUrl }).then(model => {
    model.configUrl = 'git@git.corp.yahoo.com:foo/bar.git#master';
    return model.update();
})
```

#### Sync
Sync the pipeline. Look up the configuration in the repo to create and delete jobs if necessary.
```
model.sync()
```

#### Format the Scm Url
Format the scm url. Will make the scm url lower case and add a #master branch name if a branch name is not already specified.
```
model.formatScmUrl(scmUrl)
```

| Parameter        | Type  | Required  |  Description |
| :-------------   | :---- | :---- | :-------------|
| scmUrl        | String | Yes | Github scm url |

Example:
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.PipelineFactory.getInstance({ datastore });
const scmUrl = 'git@git.corp.yahoo.com:foo/BAR.git';
factory.get({ scmUrl }).then(model => {
    const formattedScmUrl = model.formatScmUrl(model.scmUrl);
    console.log(formattedScmUrl);   // Prints 'git@git.corp.yahoo.com:foo/bar.git#master'
})
```

### Job Factory
#### Search
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.JobFactory.getInstance({ datastore });
const config = {
    params: {
        pipelineId: 'aabbccdd1234'
    },
    paginate {
        page: 2,
        count: 3
    }
}

factory.list(config).then(jobs => {
    // Do stuff with list of jobs
});
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| config        | Object | Config Object |
| config.paginate.page | Number | The page for pagination |
| config.paginate.count | Number | The count for pagination |
| config.params | Object | fields to search on |

#### Create
```js
factory.create(config).then(model => {
    // do stuff with job model
});
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| config        | Object | Configuration Object |
| config.pipelineId | String | The pipelineId that the job belongs to |
| config.name | String | The name of the job |

#### Get
Get a job based on id. Can pass the generatedId for the job, or the unique keys for the model, and the id will be determined automatically.
```js
factory.get(id).then(model => {
    // do stuff with job model
});

factory.get({ pipelineId, name }).then(model => {
    // do stuff with job model
});
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| id | String | The unique ID for the job |
| config.pipelineId | String | Id of the pipeline the job is associated with |
| config.name | String Name of the job |

### Job Model
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.JobFactory.getInstance({ datastore });

factory.get(id).then(model => {
    model.name = 'hello';
    return model.update();
});
```

#### Update
Update a specific job
```
model.update()
```

### Build Factory
#### Search
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.BuildFactory.getInstance({ datastore });
const config = {
    params: {
        jobId: 'aaabbccdd1234'
    },
    paginate {
        page: 2,
        count: 3
    }
}

factory.list(config).then(builds => {
    // Do stuff with list of builds
});
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| config        | Object | Config Object |
| config.paginate.page | Number | The page for pagination |
| config.paginate.count | Number | The count for pagination |
| config.params | Object | fields to search on |

#### Create
```js
factory.create(config).then(model => {
    // do stuff with build model
});
```

| Parameter        | Type  |  Required | Description |
| :-------------   | :---- | :-------------|  :-------------|
| config        | Object | Yes | Configuration Object |
| config.apiUri | String | Yes | URI back to the API |
| config.tokenGen | FUnction | Yes | Generator for building tokens |
| config.username | String | Yes | User who made the change to kick off the build |
| config.container | String | No | Container for the build to run in |
| config.sha | String | No | SHA used to kick off the build |

#### Get
Get a build based on id. Can pass the generatedId for the build, or the unique keys for the model, and the id will be determined automatically.
```js
factory.get(id).then(model => {
    // do stuff with build model
});

factory.get({ jobId, number }).then(model => {
    // do stuff with build model
});
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| id | String | The unique ID for the build |
| config.jobId | String | The unique ID for a job |
| config.number | Number | build number |

### Build Model
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.BuildFactory.getInstance(config);

factory.get(id).then(model => {
    model.state = 'FAILURE';
    model.update();
});
```

#### Update
Update a specific build
```
model.update()
```

#### Stream
Stream the log of a build
```
model.stream()
```

### User Factory
#### Search
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.UserFactory.getInstance({ datastore });
const config = {
    params: {
        username: 'batman'
    },
    paginate {
        page: 2,
        count: 3
    }
}

factory.list(config).then(users => {
    // Do stuff with list of users
});
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| config        | Object | Config Object |
| config.paginate.page | Number | The page for pagination |
| config.paginate.count | Number | The count for pagination |
| config.params | Object | fields to search on |

#### Create
```js
factory.create(config).then(model => {
    // do stuff with user model
});
```

| Parameter        | Type  |  Required | Description |
| :-------------   | :---- | :-------------|  :-------------|
| config        | Object | Yes | Configuration Object |
| config.username | String | Yes | User who made the change to kick off the build |
| config.token | String | Yes | unsealed token |
| config.password | String | Yes | User's password used to seal/unseal token, not saved in datastore |

#### Get
Get a user based on id. Can pass the generatedId for the user, or the username, and the id will be determined automatically.
```js
factory.get(id).then(model => {
    // do stuff with user model
});

factory.get({ username }).then(model => {
    // do stuff with user model
});
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| id | String | The unique ID for the build |
| config.username | String | User name |

### User Model
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.UserFactory.getInsance({ datastore });
const config = {
    username: 'myself',
    token: 'eyJksd3',            // User's github token
    password
}

factory.create(config)
    .then(user => user.getPermissions(scmUrl))
    .then(permissions => {
        // do stuff here
    });
```

#### Update
Update a specific user
```
model.update()
```

#### Seal Token
Seal a token
```
model.sealToken(token)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| token | String | The token to seal |


#### Unseal Token
Unseal the user's token
```
model.unsealToken()
```

#### Get User's Permissions For a Repo
Get user's permissions for a specific repo
```
model.getPermissions(scmUrl)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| scmUrl | String | The scmUrl of the repo |

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
