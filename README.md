# Screwdriver Models
[![Version][npm-image]][npm-url] ![Downloads][downloads-image] [![Build Status][status-image]][status-url] [![Open Issues][issues-image]][issues-url] [![Dependency Status][daviddm-image]][daviddm-url] ![License][license-image]

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
const factory = Model.PipelineFactory.getInstance({
    datastore,
    scm
});
const config = {
    params: {
        scmUri: 'github.com:12345:banana'
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
| config.scmUri | String | Yes | Source Code URI for the application |
| config.scmContext | String | Yes | Scm context to which user belongs |

#### Get
Get a pipeline based on id. Can pass the generatedId for the pipeline, or the unique keys for the model, and the id will be determined automatically.
```js
factory.get(id).then(model => {
    // do stuff with pipeline model
});

factory.get({ scmUri }).then(model => {
    // do stuff with pipeline model
});
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| id | Number | The unique ID for the pipeline |
| config.scmUri | String | Source Code URI for the application |


### Pipeline Model

#### Update
Update a specific pipeline model
```js
model.update()
```

Example:
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.PipelineFactory.getInstance({
    datastore,
    scm
});
const scmUri = 'github.com:12345:master';
factory.get({ scmUri }).then(model => {
    model.scmUri = 'github.com:12345:foo';
    return model.update();
})
```

#### Add Screwdriver webhook
Attach Screwdriver webhook to the pipeline's repository
```js
model.addWebhook(webhookUrl)
```

| Parameter        | Type  | Description |
| :-------------   | :---- | :--------|
| webhookUrl        | String | The webhook url to be added |


#### Sync
Sync the pipeline. Look up the configuration in the repo to create and delete jobs if necessary.
```js
model.sync()
```

#### Get Configuration
Get the screwdriver configuration for the pipeline at the given ref
```js
model.getConfiguration(config)
```

| Parameter        | Type  | Required | Description |
| :-------------   | :---- | :--- | :--------|
| ref        | String | No | Reference to the branch or PR |


#### Get Jobs
Return a list of jobs that belong to this pipeline
```js
model.getJobs(config)
```

| Parameter        | Type  | Required | Default | Description |
| :-------------   | :---- | :--- | :--- | :-------------|
| config        | Object | No | | Configuration Object |
| config.params | Object | No | | Fields to search on |
| config.params.sort | Boolean | No | false| Sorting by createTime |


#### Get Events
Return a list of events that belong to this pipeline
```js
model.getEvents(config)
```

| Parameter        | Type  | Required | Default | Description |
| :-------------   | :---- | :--- | :--- | :-------------|
| config        | Object | No | | Config Object |
| config.type | Number | No | `pipeline` | Type of event: `pipeline` or `pr` |
| config.sort | Number | No | `descending`| Sorting by createTime |

### Job Factory
#### Search
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.JobFactory.getInstance({
    datastore
});
const config = {
    params: {
        pipelineId: 1
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
| config        | Object | Configuration Object |
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
| config.pipelineId | Number | The pipelineId that the job belongs to |
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
| id | Number | The unique ID for the job |
| config.pipelineId | Number | Id of the pipeline the job is associated with |
| config.name | String Name of the job |

### Job Model
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.JobFactory.getInstance({
    datastore
});

factory.get(id).then(model => {
    model.name = 'hello';
    return model.update();
});
```

#### Update
Update a job
```js
model.update()
```

#### Get builds
Return builds that belong to this job
```js
mode..getBuilds(config)
```

| Parameter        | Type  | Required | Default |  Description |
| :-------------   | :---- | :--- | :---- | :-------------|
| config        | Object | No | | Configuration Object |
| config.sort | String | No | descending | `ascending` or `descending` |

#### Get running builds
Return all running builds that belong to this jobId
```js
model.getRunningBuilds()
```

### Build Factory
#### Search
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.BuildFactory.getInstance({  
    datastore,
    scm,
    executor,
    uiUri
});
const config = {
    params: {
        jobId: 4
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
| config.tokenGen | Function | Yes | Generator for building tokens |
| config.username | String | Yes | User who made the change to kick off the build |
| config.scmContext | String | Yes | Scm context to which user belongs |
| config.container | String | No | Container for the build to run in |
| config.sha | String | No | SHA used to kick off the build |
| config.prRef | String | No | PR branch or reference; required for PR jobs |
| config.eventId | Number | No | Id of the event this build belongs to |

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
| id | Number | The unique ID for the build |
| config.jobId | Number | The unique ID for a job |
| config.number | Number | build number |

### Build Model
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.BuildFactory.getInstance({  
    datastore,
    scm,
    executor,
    uiUri
});

factory.get(id).then(model => {
    model.state = 'FAILURE';
    model.update();
});
```

#### Update
Update a specific build
```js
model.update()
```

#### Stream
Stream the log of a build
```js
model.stream()
```

#### Update commit status
Update  a commit status
```js
model.updateCommitStatus(pipeline)
```
| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| pipeline        | Pipeline | The pipeline that this build belongs to |

#### Start a build
Start the build and update commit status as pending
```js
model.start()
```

#### Stop a build
```js
model.stop()
```

#### Check if a build is done
```js
model.isDone()
```

### User Factory
#### Search
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.UserFactory.getInstance({
    datastore,
    scm,
    password            // Password to seal/unseal user's token
});
const config = {
    params: {
        username: 'batman',
        scmContext: 'github:github.com'
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
| config.scmContext | String | Yes | Scm context to which user belongs |
| config.password | String | Yes | User's password used to seal/unseal token, not saved in datastore |

#### Get
Get a user based on id. Can pass the generatedId for the user, or the username, and the id will be determined automatically.
Can also pass a Screwdriver access token, and will get the user associated with that token.
```js
factory.get(id).then(model => {
    // do stuff with user model
});

factory.get({ username }).then(model => {
    // do stuff with user model
});

factory.get({ token }).then(model => {
    // do stuff with user model
});
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| id | Number | The unique ID for the build |
| config.username | String | User name |
| config.scmContext | String | Scm context to which user belongs |
| config.accessToken | String | A user access token value |

### User Model
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.UserFactory.getInstance({
    datastore,
    scm,
    password                    // Password to seal/unseal user's token
});
const config = {
    username: 'myself',
    token: 'eyJksd3',            // User's github token
    scmContext: 'github:github.com',          // Scm context to which user belongs
    password
}

factory.create(config)
    .then(user => user.getPermissions(scmUri))
    .then(permissions => {
        // do stuff here
    });
```

#### Update
Update a specific user
```js
model.update()
```

#### Seal Token
Seal a token
```js
model.sealToken(token)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| token | String | The token to seal |


#### Unseal Token
Unseal the user's token
```js
model.unsealToken()
```

#### Get User's Permissions For a Repo
Get user's permissions for a specific repo
```js
model.getPermissions(scmUri)
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| scmUri | String | The scmUri of the repo |

#### Tokens
Get the user's access tokens
```js
model.tokens
    .then((tokens) => {
        // do stuff with tokens
    });
```


### Secret Factory
#### Search
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.SecretFactory.getInstance({
    datastore,
    password            // Password for encryption operations
});
const config = {
    params: {
        pipelineId: 1
    },
    paginate {
        page: 2,
        count: 3
    }
}

factory.list(config).then(secrets => {
    // Do stuff with list of secrets
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
    // do stuff with secret model
});
```

| Parameter        | Type  |  Required | Description |
| :-------------   | :---- | :-------------|  :-------------|
| config        | Object | Yes | Configuration Object |
| config.pipelineId | Number | Yes | Pipeline that this secret belongs to |
| config.name | String | Yes | Secret name |
| config.value | String | Yes | Secret value |
| config.allowInPR | String | Yes | Flag to denote if this secret can be shown in PR builds |

#### Get
Get a secret based on id. Can pass the generatedId for the secret, or the combination of pipelineId and secret name, and the id will be determined automatically.
```js
factory.get(id).then(model => {
    // do stuff with secret model
});

factory.get({ pipelineId, name }).then(model => {
    // do stuff with secret model
});
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| id | Number | The unique ID for the build |
| config.pipelineId | Number | Pipeline that the secret belongs to |
| config.name | String | Secret name |


### Secret Model
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.SecretFactory.getInstance({
    datastore,
    password            // Password for encryption operations
});
const config = {
    pipelineId: 1,
    name: 'NPM_TOKEN',
    value: banana,
    allowInPR: false
}

factory.create(config)
    .then(model => // do something
    });
```

#### Update
Update a specific secret
```js
model.update()
```

### Event Factory
#### Search
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.EventFactory.getInstance({
    datastore,
    scm
});
const config = {
    params: {
        pipelineId: 1
    }
}

factory.list(config).then(events => {
    // Do stuff with list of events
});
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| config        | Object | Config Object |
| config.params | Object | fields to search on |

#### Create
```js
factory.create(config).then(model => {
    // do stuff with event model
});
```

| Parameter        | Type  |  Required | Description |
| :-------------   | :---- | :-------------|  :-------------|
| config        | Object | Yes | Configuration Object |
| config.type | String | No | Event type: pipeline or pr |
| config.pipelineId | Number | Yes | Unique identifier of pipeline |
| config.sha | String | Yes | Commit sha that the event was based on |
| config.workflow | Array | No | Workflow of the pipeline |
| config.workflowGraph | Object | No | Workflow graph of the pipeline, with edges and nodes |
| config.username | String | Yes | Username of the user that creates this event |
| config.causeMessage | String | No | Message that describes why the event was created |

#### Get
Get an event based on id. Can pass the generatedId for the event, or { pipelineId, sha } and the id will be determined automatically.
```js
factory.get(id).then(model => {
    // do stuff with event model
});

factory.get({ pipelineId, sha }).then(model => {
    // do stuff with event model
});
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| id | Number | The unique ID for the build |
| config.pipelineId | Number | Unique identifier of pipeline |
| config.sha | String | Commit sha that the event was based on |

### Event Model
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.EventFactory.getInstance({
    datastore,
    scm
});
const config = {
    pipelineId: 1,
    sha: 'ccc49349d3cffbd12ea9e3d41521480b4aa5de5f',
    workflowGraph: {
        nodes: [
            { name: '~pr' },
            { name: '~commit' },
            { name: 'main' },
            { name: 'publish' }
        ],
        edges: [
            { src: '~pr', dest: 'main' },
            { src: '~commit', dest: 'main' },
            { src: 'main', dest: 'publish' }
        ]
    },    
    username: 'stjohn',
    causeMessage: 'Merge pull request #26 from screwdriver-cd/models'
}

factory.create(config)
    .then(model => {    // do something
    });
```

Example event model that got created:
```json
{
    "type": "pipeline",
    "pipelineId": "1",
    "sha": "ccc49349d3cffbd12ea9e3d41521480b4aa5de5f",
    "createTime": "2038-01-19T03:14:08.131Z",
    "commit": {
        "url": "https://link.to/commitDiff",
        "message": "some commit message that is here",
        "author": {
            "avatar": "https://avatars.githubusercontent.com/u/1234567?v=3",
            "name": "Batman",
            "url": "https://internal-ghe.mycompany.com/imbatman",
            "username": "imbatman"
        }
    },
    "workflowGraph": {
        "nodes": [
            { "name": "~pr" },
            { "name": "~commit" },
            { "name": "main" },
            { "name": "publish" }
        ],
        "edges": [
            { "src": "~pr", "dest": "main" },
            { "src": "~commit", "dest": "main" },
            { "src": "main", "dest": "publish" }
        ]
    },
    "causeMessage": "Merge pull request #26 from screwdriver-cd/models",
    "creator": {
        "avatar": "https://avatars.githubusercontent.com/u/2042?v=3",
        "name": "St John",
        "url": "https://github.com/stjohn",
        "username": "stjohn"
    }
}
```

#### Update
Update a specific event
```js
model.update()
```

#### Get builds
Get builds that belong to this event
```js
model.getBuilds()
```

### Template Model
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.TemplateFactory.getInstance({
    datastore
});
const config = {
    name: 'testTemplate',
    version: '1.3',
    description: 'I am a test template',    
    maintainer: 'foo@bar.com',
    scmUri: 'github:123:master',
    config: { image: 'node:6'},
    labels: ['beta', 'stable']
}

factory.create(config)
    .then(model => {    // do something
    });
```

#### Update
Update a specific template
```js
model.update()
```

### Template Factory
#### Create
```js
factory.create(config).then(model => {
    // do stuff with template model
});
```

| Parameter        | Type  |  Required | Description |
| :-------------   | :---- | :-------------|  :-------------|
| config        | Object | Yes | Configuration Object |
| config.name | String | Yes | The template name |
| config.version | String | Yes | Version of the template |
| config.description | String | Yes | Description of the template |
| config.maintainer | Array | Yes | Maintainer's email |
| config.config | Object | Yes | Config of the screwdriver-template.yaml |
| config.pipelineId | Number | Yes | pipelineId of the template |
| config.labels | Array | No | Labels attached to the template |

#### Get
Get a template based on id.
```js
factory.get(id).then(model => {
    // do stuff with template model
});
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| id | Number | The unique ID for the Template |

#### Get Template
Get the latest template by name or get a specific template using name and version or name and tag. The version can be in any valid version format: either major, major.minor, or major.minor.patch. If no version is specified, the function will resolve with the latest version published. If no match is found, the function will resolve null.
```js
factory.getTemplate(fullTemplateName).then(model => {
    // do stuff with template model
});
```

| Parameter        | Type   |  Required | Description |
| :-------------   | :----- | :-------------|  :-------------|
| fullTemplateName | String | Yes | Name of the template and the version or tag (e.g. chef/publish@1.2.3 or chef/publish@latest). Can also be just name of the template (e.g. chef/publish) |

### Template Tag Model
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.TemplateTagFactory.getInstance({
    datastore
});
const config = {
    name: 'testTemplate',
    tag: 'stable',
    version: '1.3'
}

factory.create(config)
    .then(model => {    // do something
    });
```

#### Update
Update a specific template tag
```js
// update template version value
model.version = '2.4';

model.update()
```

### Template Tag Factory
#### Create
```js
factory.create(config).then(model => {
    // do stuff with template tag model
});
```

| Parameter        | Type  |  Required | Description |
| :-------------   | :---- | :-------------|  :-------------|
| config        | Object | Yes | Configuration Object |
| config.name | String | Yes | The template name |
| config.tag | String | Yes | The template tag (e.g. stable, latest, etc) |
| config.version | String | Yes | Version of the template |

#### Get
Get a template tag based on id.
```js
factory.get(id).then(model => {
    // do stuff with template model
});
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| id | Number | The unique ID for the Template Tag |

### Trigger Model
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.TriggerFactory.getInstance({
    datastore
});
const config = {
    dest: '~sd@123:component',
    src: '~sd@456:main'
}

factory.create(config)
    .then(model => {    // do something
});
```

### Trigger Factory
#### Create
```js
factory.create(config).then(model => {
    // do stuff with trigger model
});
```

| Parameter        | Type  |  Required | Description |
| :-------------   | :---- | :-------------|  :-------------|
| config        | Object | Yes | Configuration Object |
| config.src | String | Yes | The job that initiates the trigger (ex: ~sd@123:component) |
| config.dest | String | Yes | The job that is triggered (ex: ~sd@456:main) |

#### Get
Get trigger based on id.
```js
factory.get(id).then(model => {
    // do stuff with trigger model
});
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| id | Number | The unique ID for the trigger |

#### List
List triggers that have dest as `~sd@456:main`
```js
// update template version value
factory.list({
    params: {
        dest: '~sd@456:main'
    }
}).then(recs => 
    // do things with the records 
);
```
### Token Factory
#### Search
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.TokenFactory.getInstance({
    datastore
});
const config = {
    params: {
        userId: 12345
    },
    paginate {
        page: 1,
        count: 3
    }
}

factory.list(config).then(tokens => {
    // Do stuff with list of tokens
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
    // do stuff with token model
});
```

| Parameter        | Type  |  Required | Description |
| :-------------   | :---- | :-------------|  :-------------|
| config        | Object | Yes | Configuration Object |
| config.userId | Number | Yes | User that this token belongs to |
| config.name | String | Yes | Token name |
| config.description | String | No | Description of the token |

#### Get
Get a token based on id. Can pass the generatedId for the token, or the token value, and the id will be determined automatically.
```js
factory.get(id).then(model => {
    // do stuff with token model
});

factory.get({ value }).then(model => {
    // do stuff with token model
});
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| id | Number | The unique ID for the token |
| config.value | String | The value of the token |


### Token Model
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.TokenFactory.getInstance({
    datastore,
});
const config = {
    userId: 12345,
    name: 'NPM_TOKEN',
    description: 'A token for use by npm'
}

factory.create(config)
    .then(model => // do something
    });
```

#### Update
Update a specific token
```js
model.update()
```

#### Refresh
Refresh a token's value while preserving its other metadata. Attaches a temporary "value" field to the model
```js
token.refresh()
    .then(model => // do something with the new model.value
    });
```

### Collection Factory
#### Search
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.CollectionFactory.getInstance({
    datastore
});
const config = {
    params: {
        userId: 12345
    }
};

factory.list(config).then(collections => {
    // Do stuff with list of collections
});
```

| Parameter     | Type   | Description         |
| :-------------| :------| :-------------------|
| config        | Object | Config object       |
| config.params | Object | Fields to search on |

#### Create
```js
factory.create(config).then(model => {
    // do stuff with collection model
});
```

| Parameter          | Type   | Required | Description                                              |
| :------------------| :------| :--------| :--------------------------------------------------------|
| config             | Object | Yes      | Configuration Object                                     |
| config.userId      | Number | Yes      | User that this collection belongs to                     |
| config.name        | String | Yes      | Collection name                                          |
| config.description | String | No       | Collection description                                   |
| config.pipelineIds | Array  | No       | List of ids of pipelines associated with this collection |

#### Get
Get a collection based on unique id of collection. Can also pass in a combination of userId and collection name, and the id will be determined automatically.
```js
factory.get(id).then(model => {
    // do stuff with collection model
});

factory.get({ userId, name }).then(model => {
    // do stuff with collection model
})
```

| Parameter | Type   | Description                      |
| :---------| :------| :--------------------------------|
| id        | Number | The unique id for the collection |

### Collection Model
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.CollectionFactory.getInstance({
    datastore
});
const config = {
    userId: 12345,
    name: 'Screwdriver',
    description: 'Collection of screwdriver pipelines'
};

factory.create(config)
    .then(model => {
        // do something with model
    });
```

#### Update
Update a specific collection
```js
model.update()
```

#### Remove
Remove a specific collection
```js
model.remove()
```

### Command Model
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.CommandFactory.getInstance({
    datastore
});
const config = {
    namespace: 'testCommandNS',
    name: 'testCommand',
    version: '1.3',
    description: 'This is a test command',
    maintainer: 'foo@bar.com',
    format: 'habitat',
    habitat: {
        mode: 'remote',
        package: 'core/git/2.14.1',
        command: 'git'
    }
}

factory.create(config)
    .then(model => {    // do something
    });
```

### Command Factory
#### Create
```js
factory.create(config).then(model => {
    // do stuff with command model
});
```

| Parameter        | Type  |  Required | Description |
| :-------------   | :---- | :-------------|  :-------------|
| config        | Object | Yes | Configuration Object |
| config.namespace | String | Yes | The command namespace |
| config.name | String | Yes | The command name |
| config.version | String | Yes | Version of the command |
| config.description | String | Yes | Description of the command |
| config.maintainer | String | Yes | Maintainer's email |
| config.format | String | Yes | Format of the command, habitat or docker or binary |
| config.habitat | Object | Yes (any one of habitat, docker, binary) | Configuration Object for Habitat command |
| config.docker | Object | Yes (any one of habitat, docker, binary) | Configuration Object for Docker command |
| config.binary | Object | Yes (any one of habitat, docker, binary) | Configuration Object for Binary command |

#### Get
Get a command based on id.
```js
factory.get(id).then(model => {
    // do stuff with command model
});
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| id | Number | The unique ID for the Command |

#### Get Command
Get the latest command by name or get a specific command using namespace, command name and version or tag. The version can be in any valid version format: either major, major.minor, or major.minor.patch. If no version is specified, the function will resolve with the latest version published. If no match is found, the function will resolve null.
```js
factory.getCommand(fullCommandName).then(model => {
    // do stuff with command model
});
```

| Parameter        | Type   |  Required | Description |
| :-------------   | :----- | :-------------|  :-------------|
| fullCommandName | String | Yes | Namespace and name of the command and the version or tag (e.g. chefdk/knife@1.2.3 or chefdk/knife@latest). Can also be just namespace and name of the command (e.g. chefdk/knife) |

### Command Tag Model
```js
'use strict';
const Model = require('screwdriver-models');
const factory = Model.CommandTagFactory.getInstance({
    datastore
});
const config = {
    namespace: 'testCommandNS',
    name: 'testCommand',
    tag: 'stable',
    version: '1.3.5'
}

factory.create(config)
    .then(model => {    // do something
    });
```

#### Update
Update a specific command tag
```js
// update command version value
model.version = '2.4.8';

model.update()
```

### Command Tag Factory
#### Create
```js
factory.create(config).then(model => {
    // do stuff with command tag model
});
```

| Parameter        | Type  |  Required | Description |
| :-------------   | :---- | :-------------|  :-------------|
| config        | Object | Yes | Configuration Object |
| config.namespace | String | Yes | The command namespace |
| config.name | String | Yes | The command name |
| config.tag | String | Yes | The command tag (e.g. stable, latest, etc) |
| config.version | String | Yes | Exact version of the command |

#### Get
Get a command tag based on id.
```js
factory.get(id).then(model => {
    // do stuff with command model
});
```

| Parameter        | Type  |  Description |
| :-------------   | :---- | :-------------|
| id | Number | The unique ID for the Command Tag |

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
[issues-image]: https://img.shields.io/github/issues/screwdriver-cd/screwdriver.svg
[issues-url]: https://github.com/screwdriver-cd/screwdriver/issues
[status-image]: https://cd.screwdriver.cd/pipelines/9/badge
[status-url]: https://cd.screwdriver.cd/pipelines/9
[daviddm-image]: https://david-dm.org/screwdriver-cd/models.svg?theme=shields.io
[daviddm-url]: https://david-dm.org/screwdriver-cd/models
