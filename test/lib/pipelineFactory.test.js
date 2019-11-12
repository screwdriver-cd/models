'use strict';

const assert = require('chai').assert;
const mockery = require('mockery');
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');

class Pipeline {}

sinon.assert.expose(assert, { prefix: '' });

describe('Pipeline Factory', () => {
    let PipelineFactory;
    let datastore;
    let scm;
    let factory;
    let userFactoryMock;
    let tokenFactoryMock;
    let buildClusterFactoryMock;
    let buildClusterFactory;
    const dateNow = 1111111111;
    const nowTime = (new Date(dateNow)).toISOString();
    const scmUri = 'github.com:12345:master';
    const scmContext = 'github:github.com';
    const testId = 123;
    const admins = ['me'];
    const scmRepo = {
        name: 'foo/bar',
        branch: 'master',
        url: 'https://github.com/foo/bar/tree/master'
    };
    const sdBuildClusters = [{
        name: 'sd1',
        managedByScrewdriver: true,
        isActive: true,
        scmContext,
        scmOrganizations: [],
        weightage: 100
    }];
    const externalBuildCluster = {
        name: 'iOS',
        managedByScrewdriver: false,
        isActive: true,
        scmContext,
        scmOrganizations: ['screwdriver']
    };
    let pipelineConfig;

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        datastore = {
            save: sinon.stub(),
            scan: sinon.stub(),
            get: sinon.stub()
        };
        scm = {
            decorateUrl: sinon.stub()
        };
        userFactoryMock = {
            get: sinon.stub()
        };
        tokenFactoryMock = {
            get: sinon.stub()
        };
        buildClusterFactoryMock = {
            list: sinon.stub().resolves([]),
            get: sinon.stub().resolves(externalBuildCluster)
        };
        buildClusterFactory = {
            getInstance: sinon.stub().returns(buildClusterFactoryMock)
        };

        // Fixing mockery issue with duplicate file names
        // by re-registering data-schema with its own implementation
        mockery.registerMock('screwdriver-data-schema', schema);
        mockery.registerMock('./pipeline', Pipeline);
        mockery.registerMock('./userFactory', {
            getInstance: sinon.stub().returns(userFactoryMock)
        });
        mockery.registerMock('./tokenFactory', {
            getInstance: sinon.stub().returns(tokenFactoryMock)
        });
        mockery.registerMock('./buildClusterFactory', buildClusterFactory);

        // eslint-disable-next-line global-require
        PipelineFactory = require('../../lib/pipelineFactory');

        pipelineConfig = {
            datastore,
            scm,
            id: testId,
            scmUri,
            scmContext,
            createTime: nowTime,
            admins,
            multiBuildClusterEnabled: true
        };

        factory = new PipelineFactory(pipelineConfig);
    });

    afterEach(() => {
        datastore = null;
        mockery.deregisterAll();
        mockery.resetCache();
    });

    after(() => {
        mockery.disable();
    });

    describe('createClass', () => {
        it('should return a Pipeline', () => {
            const model = factory.createClass(pipelineConfig);

            assert.instanceOf(model, Pipeline);
        });
    });

    describe('create', () => {
        let sandbox;
        const saveConfig = {
            table: 'pipelines',
            params: {
                admins,
                createTime: nowTime,
                name: scmRepo.name,
                scmUri,
                scmContext,
                scmRepo
            }
        };

        beforeEach(() => {
            sandbox = sinon.createSandbox({
                useFakeTimers: false
            });
            sandbox.useFakeTimers(dateNow);
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('multipleBuildClusterDisabled without annotations - ' +
            'creates a new pipeline in the datastore ', () => {
            const expected = {
                id: testId,
                admins,
                createTime: nowTime,
                scmUri,
                scmRepo
            };

            factory.multiBuildClusterEnabled = false;
            datastore.save.resolves(expected);
            scm.decorateUrl.resolves(scmRepo);

            userFactoryMock.get.withArgs({
                username: Object.keys(admins)[0],
                scmContext
            }).resolves({
                unsealToken: sinon.stub().resolves('foo')
            });

            return factory.create({
                scmUri,
                scmContext,
                admins
            }).then((model) => {
                assert.calledWith(scm.decorateUrl, { scmUri, scmContext, token: 'foo' });
                assert.calledWith(datastore.save, saveConfig);
                assert.instanceOf(model, Pipeline);
            });
        });

        it('multipleBuildClusterDisabled with annotations - ' +
            'creates a new pipeline in the datastore ', () => {
            const expected = {
                id: testId,
                admins,
                createTime: nowTime,
                scmUri,
                scmRepo,
                annotations: {
                    'screwdriver.cd/prChain': 'fork'
                }
            };

            factory.multiBuildClusterEnabled = false;
            datastore.save.resolves(expected);
            scm.decorateUrl.resolves(scmRepo);

            userFactoryMock.get.withArgs({
                username: Object.keys(admins)[0],
                scmContext
            }).resolves({
                unsealToken: sinon.stub().resolves('foo')
            });
            saveConfig.params.annotations = { 'screwdriver.cd/prChain': 'fork' };

            return factory.create({
                scmUri,
                scmContext,
                admins,
                annotations: { 'screwdriver.cd/prChain': 'fork' }
            }).then((model) => {
                assert.calledWith(scm.decorateUrl, { scmUri, scmContext, token: 'foo' });
                assert.calledWith(datastore.save, saveConfig);
                assert.instanceOf(model, Pipeline);
            });
        });

        it('multipleBuildClusterEnabled without annotations - ' +
            'creates a new pipeline in the datastore - ' +
            'pick screwdriver cluster', () => {
            const expected = {
                id: testId,
                admins,
                createTime: nowTime,
                scmUri,
                scmRepo,
                annotations: { 'screwdriver.cd/buildCluster': 'sd1' }
            };

            datastore.save.resolves(expected);
            scm.decorateUrl.resolves(scmRepo);
            buildClusterFactoryMock.list.resolves(sdBuildClusters);
            saveConfig.params.annotations = { 'screwdriver.cd/buildCluster': 'sd1' };

            userFactoryMock.get.withArgs({
                username: Object.keys(admins)[0],
                scmContext
            }).resolves({
                unsealToken: sinon.stub().resolves('foo')
            });

            return factory.create({
                scmUri,
                scmContext,
                admins
            }).then((model) => {
                assert.calledWith(scm.decorateUrl, { scmUri, scmContext, token: 'foo' });
                assert.calledWith(datastore.save, saveConfig
                );
                assert.instanceOf(model, Pipeline);
            });
        });

        it('multipleBuildClusterEnabled without cluster annotations - ' +
            'creates a new pipeline in the datastore - ' +
            'pick screwdriver cluster', () => {
            const expected = {
                id: testId,
                admins,
                createTime: nowTime,
                scmUri,
                scmRepo,
                annotations: {
                    'screwdriver.cd/prChain': 'fork',
                    'screwdriver.cd/buildCluster': 'sd1'
                }
            };

            datastore.save.resolves(expected);
            scm.decorateUrl.resolves(scmRepo);
            buildClusterFactoryMock.list.resolves(sdBuildClusters);
            saveConfig.params.annotations = {
                'screwdriver.cd/prChain': 'fork',
                'screwdriver.cd/buildCluster': 'sd1'
            };

            userFactoryMock.get.withArgs({
                username: Object.keys(admins)[0],
                scmContext
            }).resolves({
                unsealToken: sinon.stub().resolves('foo')
            });

            return factory.create({
                scmUri,
                scmContext,
                admins,
                annotations: {
                    'screwdriver.cd/prChain': 'fork'
                }
            }).then((model) => {
                assert.calledWith(scm.decorateUrl, { scmUri, scmContext, token: 'foo' });
                assert.calledWith(datastore.save, saveConfig
                );
                assert.instanceOf(model, Pipeline);
            });
        });

        it('multipleBuildClusterEnabled with cluster annotations - ' +
            'creates a new pipeline in the datastore', () => {
            scmRepo.name = 'screwdriver/ui';
            const expected = {
                id: testId,
                admins,
                createTime: nowTime,
                scmUri,
                scmRepo,
                annotations: {
                    'screwdriver.cd/prChain': 'fork',
                    'screwdriver.cd/buildCluster': 'iOS'
                }
            };

            datastore.save.resolves(expected);
            scm.decorateUrl.resolves(scmRepo);
            buildClusterFactoryMock.get.resolves(externalBuildCluster);
            saveConfig.params.annotations = {
                'screwdriver.cd/prChain': 'fork',
                'screwdriver.cd/buildCluster': 'iOS'
            };
            saveConfig.params.name = scmRepo.name;

            userFactoryMock.get.withArgs({
                username: Object.keys(admins)[0],
                scmContext
            }).resolves({
                unsealToken: sinon.stub().resolves('foo')
            });

            return factory.create({
                scmUri,
                scmContext,
                admins,
                annotations: {
                    'screwdriver.cd/prChain': 'fork',
                    'screwdriver.cd/buildCluster': 'iOS'
                }
            }).then((model) => {
                assert.calledWith(scm.decorateUrl, { scmUri, scmContext, token: 'foo' });
                assert.calledWith(datastore.save, saveConfig);
                assert.instanceOf(model, Pipeline);
            });
        });

        it('multipleBuildClusterEnabled with cluster annotations no value - ' +
            'creates a new pipeline in the datastore ' +
            'pick screwdriver cluster', () => {
            scmRepo.name = 'screwdriver/ui';
            const expected = {
                id: testId,
                admins,
                createTime: nowTime,
                scmUri,
                scmRepo,
                annotations: {
                    'screwdriver.cd/prChain': 'fork',
                    'screwdriver.cd/buildCluster': 'sd1'
                }
            };

            datastore.save.resolves(expected);
            scm.decorateUrl.resolves(scmRepo);
            buildClusterFactoryMock.list.resolves(sdBuildClusters);
            saveConfig.params.annotations = {
                'screwdriver.cd/prChain': 'fork',
                'screwdriver.cd/buildCluster': 'sd1'
            };
            saveConfig.params.name = scmRepo.name;

            userFactoryMock.get.withArgs({
                username: Object.keys(admins)[0],
                scmContext
            }).resolves({
                unsealToken: sinon.stub().resolves('foo')
            });

            return factory.create({
                scmUri,
                scmContext,
                admins,
                annotations: {
                    'screwdriver.cd/prChain': 'fork',
                    'screwdriver.cd/buildCluster': ''
                }
            }).then((model) => {
                assert.calledWith(scm.decorateUrl, { scmUri, scmContext, token: 'foo' });
                assert.calledWith(datastore.save, saveConfig
                );
                assert.instanceOf(model, Pipeline);
            });
        });

        it('throws err if the pipeline is unauthorized to use the build cluster', () => {
            const expected = {
                id: testId,
                admins,
                createTime: nowTime,
                scmUri,
                scmRepo,
                annotations: { 'screwdriver.cd/buildCluster': 'iOS' }
            };

            datastore.save.resolves(expected);
            scm.decorateUrl.resolves(scmRepo);
            buildClusterFactoryMock.list.resolves(sdBuildClusters);
            saveConfig.params.annotations = { 'screwdriver.cd/buildCluster': 'iOS' };

            userFactoryMock.get.withArgs({
                username: Object.keys(admins)[0],
                scmContext
            }).resolves({
                unsealToken: sinon.stub().resolves('foo')
            });

            return factory.create({
                scmUri,
                scmContext,
                admins,
                annotations: { 'screwdriver.cd/prChain': 'fork',
                    'screwdriver.cd/buildCluster': 'iOS' }
            }).catch((err) => {
                assert.instanceOf(err, Error);
                assert.strictEqual(err.message,
                    'This pipeline is not authorized to use this build cluster.');
            });
        });

        it('throws err with empty pipeline name is unauthorized to use the build cluster', () => {
            const expected = {
                id: testId,
                admins,
                createTime: nowTime,
                scmUri,
                scmRepo,
                annotations: { 'screwdriver.cd/buildCluster': 'iOS' }
            };

            scmRepo.name = 'dummy';
            datastore.save.resolves(expected);
            scm.decorateUrl.resolves(scmRepo);
            buildClusterFactoryMock.list.resolves(sdBuildClusters);
            saveConfig.params.annotations = { 'screwdriver.cd/buildCluster': 'iOS' };

            userFactoryMock.get.withArgs({
                username: Object.keys(admins)[0],
                scmContext
            }).resolves({
                unsealToken: sinon.stub().resolves('foo')
            });

            return factory.create({
                scmUri,
                scmContext,
                admins,
                annotations: { 'screwdriver.cd/prChain': 'fork',
                    'screwdriver.cd/buildCluster': 'iOS' }
            }).catch((err) => {
                assert.instanceOf(err, Error);
                assert.strictEqual(err.message,
                    'This pipeline is not authorized to use this build cluster.');
            });
        });

        it('throws err if the build cluster specified does not exist', () => {
            const expected = {
                id: testId,
                admins,
                createTime: nowTime,
                scmUri,
                scmRepo,
                annotations: { 'screwdriver.cd/buildCluster': 'iOS' }
            };

            datastore.save.resolves(expected);
            scm.decorateUrl.resolves(scmRepo);
            buildClusterFactoryMock.get.resolves(null);
            saveConfig.params.annotations = { 'screwdriver.cd/buildCluster': 'iOS' };

            userFactoryMock.get.withArgs({
                username: Object.keys(admins)[0],
                scmContext
            }).resolves({
                unsealToken: sinon.stub().resolves('foo')
            });

            return factory.create({
                scmUri,
                scmContext,
                admins,
                annotations: { 'screwdriver.cd/prChain': 'fork',
                    'screwdriver.cd/buildCluster': 'iOS' }
            }).catch((err) => {
                assert.instanceOf(err, Error);
                assert.strictEqual(err.message,
                    'Cluster specified in screwdriver.cd/buildCluster iOS does not exist.');
            });
        });
    });

    describe('get a pipeline by access token', () => {
        const accessToken = 'an access token goes here';
        const now = 1111;
        const tokenMock = {
            pipelineId: testId,
            lastUsed: null,
            update: sinon.stub()
        };
        let sandbox;

        beforeEach(() => {
            sandbox = sinon.createSandbox();
            sandbox.useFakeTimers(now);
            tokenFactoryMock.get.resolves(tokenMock);
            tokenMock.update.resolves(tokenMock);
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('should return a pipeline and update the last used field of the token', () => {
            const expected = {
                id: 123,
                username: 'frodo'
            };

            datastore.get.resolves(expected);

            return factory.get({ accessToken })
                .then((pipeline) => {
                    assert.isOk(pipeline);
                    assert.calledWith(tokenFactoryMock.get, { value: accessToken });
                    assert.calledOnce(tokenMock.update);
                    assert.equal(tokenMock.lastUsed, (new Date(now)).toISOString());
                    assert.equal(tokenMock.pipelineId, testId);
                });
        });

        it('should return null if the pipeline doesn\'t exist', () => {
            datastore.get.resolves(null);

            return factory.get({ accessToken })
                .then(pipeline => assert.isNull(pipeline));
        });

        it('should return null if the token doesn\'t exist', () => {
            tokenFactoryMock.get.resolves(null);

            return factory.get({ accessToken })
                .then(pipeline => assert.isNull(pipeline));
        });
    });

    describe('getInstance', () => {
        let config;

        beforeEach(() => {
            config = { datastore, scm: {} };
        });

        it('should utilize BaseFactory to get an instance', () => {
            const f1 = PipelineFactory.getInstance(config);
            const f2 = PipelineFactory.getInstance(config);

            assert.instanceOf(f1, PipelineFactory);
            assert.instanceOf(f2, PipelineFactory);

            assert.equal(f1, f2);
        });

        it('should throw when config does not have everything necessary', () => {
            assert.throw(PipelineFactory.getInstance,
                Error, 'No scm plugin provided to PipelineFactory');

            assert.throw(() => {
                PipelineFactory.getInstance({ datastore });
            }, Error, 'No scm plugin provided to PipelineFactory');

            assert.throw(() => {
                PipelineFactory.getInstance({ scm: {} });
            }, Error, 'No datastore provided to PipelineFactory');
        });
    });

    describe('getExternalJoin', () => {
        beforeEach(() => {
            // eslint-disable-next-line global-require
            PipelineFactory = require('../../lib/pipelineFactory');
            pipelineConfig = {
                externalJoin: false
            };
            factory = new PipelineFactory(pipelineConfig);
        });

        it('getExternalJoin returns true', () => {
            factory.externalJoin = true;
            assert.isTrue(factory.getExternalJoinFlag());
        });

        it('getExternalJoin returns false', () => {
            assert.isFalse(factory.getExternalJoinFlag());
        });
    });
});

