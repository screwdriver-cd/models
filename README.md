# Screwdriver Models
[![Version][npm-image]][npm-url] ![Downloads][downloads-image] [![Build Status][wercker-image]][wercker-url] [![Open Issues][issues-image]][issues-url] [![Dependency Status][daviddm-image]][daviddm-url] ![License][license-image]

> Screwdriver models

## Usage

```bash
npm install screwdriver-models
```

### Build Model
```js
'use strict';
const BuildModel = require('screwdriver-models');
const datastore = require('your-datastore');
const build = new BuildModel(datastore);
const config = {
    page: 1
    count: 2
}
build.list(config, (err, data) => {
    if (err) {
        throw new Error(err);
    }
    console.log(data);
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
