'use strict';

const { assert } = require('chai');
const sinon = require('sinon');
const schema = require('screwdriver-data-schema');
const { SCM_STATE_MAP } = require('screwdriver-data-schema').plugins.scm;
const rewiremock = require('rewiremock/node');

sinon.assert.expose(assert, { prefix: '' });

const WORKFLOWGRAPH_WITH_STAGES = require('../data/workflowGraphWithStages.json');

describe('Build Model', () => {
    const annotations = {};
    const freezeWindows = ['* * ? * 1', '0-59 0-23 * 1 ?'];
    const provider = {
        name: 'aws',
        region: 'us-west-2',
        accountId: 111111111111,
        role: 'arn:aws:iam::111111111111:role/role',
        executor: 'eks',
        clusterName: 'sd-build-eks'
    };
    const apiUri = 'https://notify.com/some/endpoint';
    const uiUri = 'https://display.com/some/endpoint';
    const jobId = 777;
    const jobName = 'main';
    const jobState = 'ENABLED';
    const jobArchived = false;
    const eventId = 555;
    const causeMessage = '';
    const now = 112233445566;
    const buildId = 9876;
    const sha = 'ccc49349d3cffbd12ea9e3d41521480b4aa5de5f';
    const container = 'node:4';
    const adminUser = { username: 'batman', unsealToken: sinon.stub().resolves('foo') };
    const pipelineId = 1234;
    const configPipelineId = 1233;
    const scmUri = 'github.com:12345:master';
    const scmContext = 'github:github.com';
    const scmRepo = {
        branch: 'master',
        url: 'https://github.com/org/name/tree/master',
        name: 'org/name'
    };
    const token = 'equivalentToOneQuarter';
    const url = `${uiUri}/pipelines/${pipelineId}/builds/${buildId}`;
    const meta = {
        meta: {
            summary: {
                coverage: 'Coverage increased by 15%',
                markdown: 'this markdown comment is **bold** and *italic*'
            }
        }
    };
    const TEMPORAL_JWT_TIMEOUT = 12 * 60;
    let BuildModel;
    let datastore;
    let executorMock;
    let build;
    let config;
    let BaseModel;
    let userFactoryMock;
    let jobFactoryMock;
    let pipelineFactoryMock;
    let stageFactoryMock;
    let stageBuildFactoryMock;
    let stepFactoryMock;
    let templateFactoryMock;
    let scmMock;
    let tokenGen;
    let pipelineMock;
    let jobMock;
    let templateMock;
    let eventFactoryMock;
    let buildFactoryMock;

    beforeEach(() => {
        datastore = {
            get: sinon.stub(),
            save: sinon.stub(),
            scan: sinon.stub(),
            update: sinon.stub(),
            remove: sinon.stub()
        };
        executorMock = {
            start: sinon.stub(),
            stop: sinon.stub(),
            startTimer: sinon.stub(),
            stopTimer: sinon.stub(),
            stopFrozen: sinon.stub(),
            unzipArtifacts: sinon.stub()
        };
        userFactoryMock = {
            get: sinon.stub()
        };
        jobFactoryMock = {
            get: sinon.stub()
        };
        pipelineFactoryMock = {
            get: sinon.stub().resolves(null)
        };
        stageFactoryMock = {
            get: sinon.stub().resolves([])
        };
        stageBuildFactoryMock = {
            get: sinon.stub().resolves({})
        };
        stepFactoryMock = {
            list: sinon.stub().resolves([]),
            removeSteps: sinon.stub().resolves([])
        };
        templateFactoryMock = {
            get: sinon.stub()
        };
        eventFactoryMock = {
            get: sinon.stub()
        };
        buildFactoryMock = {
            get: sinon.stub(),
            list: sinon.stub().resolves([])
        };

        pipelineMock = {
            id: pipelineId,
            scmUri,
            scmContext,
            scmRepo,
            admin: Promise.resolve(adminUser),
            token: Promise.resolve('foo'),
            workflowGraph: WORKFLOWGRAPH_WITH_STAGES
        };
        jobMock = {
            id: jobId,
            state: 'ENABLED',
            archived: false,
            name: 'main',
            pipeline: Promise.resolve(pipelineMock),
            permutations: [{ annotations, freezeWindows, provider }],
            isPR: sinon.stub().returns(false)
        };
        scmMock = {
            updateCommitStatus: sinon.stub().resolves(null),
            addPrComment: sinon.stub().resolves(null)
        };
        templateMock = {
            id: 8888,
            name: 'docker',
            namespace: 'sd'
        };
        tokenGen = sinon.stub().returns(token);
        const uF = {
            getInstance: sinon.stub().returns(userFactoryMock)
        };
        const jF = {
            getInstance: sinon.stub().returns(jobFactoryMock)
        };
        const pF = {
            getInstance: sinon.stub().returns(pipelineFactoryMock)
        };
        const sF = {
            getInstance: sinon.stub().returns(stepFactoryMock)
        };
        const stageF = {
            getInstance: sinon.stub().returns(stageFactoryMock)
        };
        const stageBuildF = {
            getInstance: sinon.stub().returns(stageBuildFactoryMock)
        };
        const tF = {
            getInstance: sinon.stub().returns(templateFactoryMock)
        };
        const eF = {
            getInstance: sinon.stub().returns(eventFactoryMock)
        };
        const bF = {
            getInstance: sinon.stub().returns(buildFactoryMock)
        };

        rewiremock('../../lib/pipelineFactory').with(pF);
        rewiremock('../../lib/userFactory').with(uF);
        rewiremock('../../lib/jobFactory').with(jF);
        rewiremock('../../lib/stepFactory').with(sF);
        rewiremock('../../lib/stageFactory').with(stageF);
        rewiremock('../../lib/stageBuildFactory').with(stageBuildF);
        rewiremock('../../lib/templateFactory').with(tF);
        rewiremock('../../lib/eventFactory').with(eF);
        rewiremock('../../lib/buildFactory').with(bF);
        rewiremock.enable();

        // eslint-disable-next-line global-require
        BuildModel = require('../../lib/build');

        config = {
            datastore,
            executor: executorMock,
            id: buildId,
            cause: 'Started by user i_made_the_request',
            container,
            createTime: now,
            jobId,
            eventId,
            meta,
            number: now,
            status: 'QUEUED',
            sha,
            scm: scmMock,
            apiUri,
            tokenGen,
            uiUri
        };
        build = new BuildModel(config);
    });

    afterEach(() => {
        datastore = null;
        rewiremock.disable();
    });

    it('extends base class', () => {
        rewiremock.disable();
        // eslint-disable-next-line global-require
        BuildModel = require('../../lib/build');
        build = new BuildModel(config);
        // eslint-disable-next-line global-require
        BaseModel = require('../../lib/base');

        assert.instanceOf(build, BaseModel);
        assert.isFunction(build.start);
        assert.isFunction(build.stop);
        assert.isFunction(build.getSteps);

        schema.models.build.allKeys.forEach(key => {
            assert.strictEqual(build[key], config[key]);
        });

        // private keys are private
        assert.isUndefined(build.executor);
        assert.isUndefined(build.apiUri);
        assert.isUndefined(build.tokenGen);
        assert.isUndefined(build.uiUri);
    });

    describe('updateCommitStatus', () => {
        beforeEach(() => {
            jobFactoryMock.get.resolves(jobMock);
        });

        it('should update the commit status with url', () =>
            build.updateCommitStatus(pipelineMock, apiUri).then(() => {
                assert.calledWith(scmMock.updateCommitStatus, {
                    token: 'foo',
                    scmUri,
                    scmContext,
                    scmRepo,
                    sha,
                    jobName: 'main',
                    buildStatus: SCM_STATE_MAP.QUEUED,
                    url,
                    pipelineId
                });
            }));

        it('resolve on error', () => {
            scmMock.updateCommitStatus.rejects(new Error('nevergonnagiveyouup'));

            return build.updateCommitStatus(pipelineMock).catch(() => {
                throw new Error('Should not get here');
            });
        });
    });

    describe('update', () => {
        let step0;
        let step1;
        let step2;
        let stepsMock;

        beforeEach(() => {
            step0 = { name: 'task0', startTime: 'now', endTime: 'then', code: 0 };
            step1 = { name: 'task1', startTime: 'now' };
            step2 = { name: 'task2' };

            const step0Mock = { update: sinon.stub().resolves({}), ...step0 };
            const step1Mock = { update: sinon.stub().resolves({}), ...step1 };
            const step2Mock = { update: sinon.stub().resolves({}), ...step2 };

            stepsMock = [step0Mock, step1Mock, step2Mock];

            executorMock.stop.resolves(null);
            datastore.update.resolves({});
            jobFactoryMock.get.resolves(jobMock);
            stepFactoryMock.list.resolves(stepsMock);
        });

        it('promises to update a build, stop the executor, and update status to failure', () => {
            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'PR-5:main',
                pipeline: Promise.resolve({
                    id: pipelineId,
                    configPipelineId,
                    scmUri,
                    scmContext,
                    scmRepo,
                    admin: Promise.resolve(adminUser),
                    token: Promise.resolve('foo')
                }),
                permutations: [{ annotations, freezeWindows, provider }],
                isPR: sinon.stub().returns(true)
            });
            build.status = 'FAILURE';

            return build.update().then(() => {
                assert.calledWith(executorMock.stop, {
                    buildId,
                    jobId,
                    annotations,
                    provider,
                    freezeWindows,
                    blockedBy: [jobId],
                    pipelineId,
                    token: 'equivalentToOneQuarter',
                    jobName: 'PR-5:main',
                    apiUri
                });
                delete stepsMock[0].update;
                delete stepsMock[1].update;
                delete stepsMock[2].update;
                // Completed step is not modified
                assert.deepEqual(stepsMock[0], step0);
                // In progress step is aborted
                assert.ok(stepsMock[1].endTime);
                assert.equal(stepsMock[1].code, 130);
                // Unstarted step is not modified
                assert.deepEqual(stepsMock[2], step2);

                assert.calledWith(scmMock.updateCommitStatus, {
                    token: 'foo',
                    scmUri,
                    scmContext,
                    scmRepo,
                    sha,
                    jobName: 'PR-5:main',
                    buildStatus: SCM_STATE_MAP.FAILURE,
                    url,
                    pipelineId
                });
                assert.calledWith(scmMock.addPrComment, {
                    token: 'foo',
                    jobName: 'PR-5:main',
                    scmContext,
                    scmRepo,
                    scmUri,
                    pipelineId,
                    comments: [
                        {
                            text:
                                '### SD Build [#9876](https://display.com/some/' +
                                'endpoint/pipelines/1234/builds/9876) Job PR-5:main\n_node:4_\n- - - -\n' +
                                '__coverage__ - Coverage increased by 15%\n' +
                                '__markdown__ - this markdown comment is **bold** and *italic*\n\n' +
                                '###### ~ Screwdriver automated build summary'
                        }
                    ],
                    prNum: 5
                });
            });
        });

        it('promises to update a build, stop the executor, and update statuses', () => {
            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'PR-5:main',
                pipeline: Promise.resolve({
                    id: pipelineId,
                    configPipelineId,
                    scmUri,
                    scmContext,
                    scmRepo,
                    admin: Promise.resolve(adminUser),
                    token: Promise.resolve('foo')
                }),
                permutations: [{ annotations, freezeWindows, provider }],
                isPR: sinon.stub().returns(true)
            });
            build.status = 'FAILURE';
            build.meta.meta.summary = {};
            build.meta.meta.status = {
                findbugs: {
                    status: 'SUCCESS',
                    message: '923 issues found. Previous count: 914 issues.',
                    url: 'http://findbugs.com'
                },
                snyk: {
                    status: 'FAILURE',
                    message: '23 package vulnerabilities found. Previous count: 0 vulnerabilities.'
                }
            };

            return build.update().then(() => {
                assert.calledWith(executorMock.stop, {
                    buildId,
                    jobId,
                    annotations,
                    provider,
                    freezeWindows,
                    blockedBy: [jobId],
                    pipelineId,
                    token: 'equivalentToOneQuarter',
                    jobName: 'PR-5:main',
                    apiUri
                });
                delete stepsMock[0].update;
                delete stepsMock[1].update;
                delete stepsMock[2].update;
                // Completed step is not modified
                assert.deepEqual(stepsMock[0], step0);
                // In progress step is aborted
                assert.ok(stepsMock[1].endTime);
                assert.equal(stepsMock[1].code, 130);
                // Unstarted step is not modified
                assert.deepEqual(stepsMock[2], step2);
                assert.calledWith(scmMock.updateCommitStatus.firstCall, {
                    token: 'foo',
                    scmUri,
                    scmContext,
                    scmRepo,
                    sha,
                    jobName: 'PR-5:main',
                    buildStatus: 'FAILURE',
                    url,
                    pipelineId
                });
                assert.calledWith(scmMock.updateCommitStatus.secondCall, {
                    token: 'foo',
                    scmUri,
                    scmContext,
                    scmRepo,
                    sha,
                    jobName: 'PR-5:main',
                    buildStatus: 'SUCCESS',
                    url: 'http://findbugs.com',
                    pipelineId,
                    context: 'findbugs',
                    description: '923 issues found. Previous count: 914 issues.'
                });
                assert.calledWith(scmMock.updateCommitStatus.thirdCall, {
                    token: 'foo',
                    scmUri,
                    scmContext,
                    scmRepo,
                    sha,
                    jobName: 'PR-5:main',
                    buildStatus: 'FAILURE',
                    url: 'https://display.com/some/endpoint/pipelines/1234/builds/9876',
                    pipelineId,
                    context: 'snyk',
                    description: '23 package vulnerabilities found. Previous count: 0 vulnerabilities.'
                });
            });
        });

        it('promises to update a build, stop the executor, and update statuses when statuses are JSON string', () => {
            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'PR-5:main',
                pipeline: Promise.resolve({
                    id: pipelineId,
                    configPipelineId,
                    scmUri,
                    scmContext,
                    scmRepo,
                    admin: Promise.resolve(adminUser),
                    token: Promise.resolve('foo')
                }),
                permutations: [{ annotations, freezeWindows, provider }],
                isPR: sinon.stub().returns(true)
            });
            build.status = 'FAILURE';
            build.meta.meta.summary = {};
            build.meta.meta.status = {
                findbugs:
                    '{"status":"SUCCESS","message":"923 issues found. ' +
                    'Previous count: 914 issues.","url":"http://findbugs.com"}',
                snyk:
                    '{"status":"FAILURE","message":"23 package vulnerabilities found. ' +
                    'Previous count: 0 vulnerabilities."}'
            };

            return build.update().then(() => {
                assert.calledWith(executorMock.stop, {
                    buildId,
                    jobId,
                    annotations,
                    provider,
                    freezeWindows,
                    blockedBy: [jobId],
                    pipelineId,
                    token: 'equivalentToOneQuarter',
                    jobName: 'PR-5:main',
                    apiUri
                });

                delete stepsMock[0].update;
                delete stepsMock[1].update;
                delete stepsMock[2].update;
                // Completed step is not modified
                assert.deepEqual(stepsMock[0], step0);
                // In progress step is aborted
                assert.ok(stepsMock[1].endTime);
                assert.equal(stepsMock[1].code, 130);
                // Unstarted step is not modified
                assert.deepEqual(stepsMock[2], step2);
                assert.calledWith(scmMock.updateCommitStatus.firstCall, {
                    token: 'foo',
                    scmUri,
                    scmContext,
                    scmRepo,
                    sha,
                    jobName: 'PR-5:main',
                    buildStatus: SCM_STATE_MAP.FAILURE,
                    url,
                    pipelineId
                });
                assert.calledWith(scmMock.updateCommitStatus.secondCall, {
                    token: 'foo',
                    scmUri,
                    scmContext,
                    scmRepo,
                    sha,
                    jobName: 'PR-5:main',
                    buildStatus: SCM_STATE_MAP.SUCCESS,
                    url: 'http://findbugs.com',
                    pipelineId,
                    context: 'findbugs',
                    description: '923 issues found. Previous count: 914 issues.'
                });
                assert.calledWith(scmMock.updateCommitStatus.thirdCall, {
                    token: 'foo',
                    scmUri,
                    scmContext,
                    scmRepo,
                    sha,
                    jobName: 'PR-5:main',
                    buildStatus: SCM_STATE_MAP.FAILURE,
                    url: 'https://display.com/some/endpoint/pipelines/1234/builds/9876',
                    pipelineId,
                    context: 'snyk',
                    description: '23 package vulnerabilities found. Previous count: 0 vulnerabilities.'
                });
            });
        });

        it('aborts running steps, and sets an endTime', () => {
            build.status = 'ABORTED';

            return build.update().then(() => {
                assert.calledWith(executorMock.stop, {
                    buildId,
                    jobId,
                    annotations,
                    provider,
                    freezeWindows,
                    blockedBy: [jobId],
                    pipelineId,
                    token: 'equivalentToOneQuarter',
                    jobName,
                    apiUri
                });

                delete stepsMock[0].update;
                delete stepsMock[1].update;
                delete stepsMock[2].update;
                // Completed step is not modified
                assert.deepEqual(stepsMock[0], step0);
                // In progress step is aborted
                assert.ok(stepsMock[1].endTime);
                assert.equal(stepsMock[1].code, 130);
                // Unstarted step is not modified
                assert.deepEqual(stepsMock[2], step2);

                assert.calledWith(scmMock.updateCommitStatus, {
                    token: 'foo',
                    scmUri,
                    scmContext,
                    scmRepo,
                    sha,
                    jobName: 'main',
                    buildStatus: SCM_STATE_MAP.ABORTED,
                    url,
                    pipelineId
                });
            });
        });

        it('aborts running steps, and sets an endTime with step models', () => {
            build.status = 'ABORTED';

            return build.update().then(() => {
                assert.calledOnce(stepsMock[0].update);
                assert.calledOnce(stepsMock[1].update);
                assert.calledOnce(stepsMock[2].update);
                assert.calledWith(executorMock.stop, {
                    buildId,
                    jobId,
                    annotations,
                    provider,
                    freezeWindows,
                    blockedBy: [jobId],
                    pipelineId,
                    token: 'equivalentToOneQuarter',
                    jobName,
                    apiUri
                });

                delete stepsMock[0].update;
                delete stepsMock[1].update;
                delete stepsMock[2].update;
                // Completed step is not modified
                assert.deepEqual(stepsMock[0], step0);
                // In progress step is aborted
                assert.ok(stepsMock[1].endTime);
                assert.equal(stepsMock[1].code, 130);
                // Unstarted step is not modified
                assert.deepEqual(stepsMock[2], step2);

                assert.calledWith(scmMock.updateCommitStatus, {
                    token: 'foo',
                    scmUri,
                    scmContext,
                    scmRepo,
                    sha,
                    jobName: 'main',
                    buildStatus: SCM_STATE_MAP.ABORTED,
                    url,
                    pipelineId
                });
            });
        });

        it('promises to update a build, but not status or executor when untouched status', () =>
            build.update().then(() => {
                assert.notCalled(scmMock.updateCommitStatus);
                assert.notCalled(executorMock.stop);
            }));

        it('promises to update a build, but not executor when status is running', () => {
            build.status = 'RUNNING';

            return build.update().then(() => {
                assert.calledWith(scmMock.updateCommitStatus, {
                    token: 'foo',
                    scmUri,
                    scmContext,
                    scmRepo,
                    sha,
                    jobName: 'main',
                    buildStatus: SCM_STATE_MAP.RUNNING,
                    url,
                    pipelineId
                });
                assert.notCalled(executorMock.stop);
            });
        });

        it('promises to update, but not executor when status is unstable & not done', () => {
            config.status = 'RUNNING';
            build = new BuildModel(config);

            // Status = RUNNING -> UNSTABLE
            build.status = 'UNSTABLE';

            return build.update().then(() => {
                assert.calledWith(scmMock.updateCommitStatus, {
                    token: 'foo',
                    scmUri,
                    scmContext,
                    scmRepo,
                    sha,
                    jobName: 'main',
                    buildStatus: SCM_STATE_MAP.UNSTABLE,
                    url,
                    pipelineId
                });
                assert.notCalled(executorMock.stop);
                assert.notCalled(executorMock.startTimer);
            });
        });

        it('promises to update, and stop executor when status is unstable & done', () => {
            // UNSTABLE -> SUCCESS, status will not change, field is not dirty
            config.status = 'UNSTABLE';
            build = new BuildModel(config);

            build.endTime = '2018-06-27T18:22:20.153Z';

            return build.update().then(() => {
                assert.notCalled(scmMock.updateCommitStatus);
                assert.notCalled(executorMock.startTimer);
                assert.calledWith(executorMock.stop, {
                    buildId,
                    jobId,
                    annotations,
                    provider,
                    freezeWindows,
                    blockedBy: [jobId],
                    pipelineId,
                    token: 'equivalentToOneQuarter',
                    jobName,
                    apiUri
                });
            });
        });

        it('starts timer in executor when status is changing to RUNNING', () => {
            // QUEUED -> RUNNING, status will change, field is dirty
            config.status = 'QUEUED';
            build = new BuildModel(config);

            build.steps = [step0, step1, step2];
            build.status = 'RUNNING';
            build.startTime = new Date().toISOString();

            return build.update().then(() => {
                assert.calledWith(scmMock.updateCommitStatus, {
                    token: 'foo',
                    scmUri,
                    scmContext,
                    scmRepo,
                    sha,
                    jobName: 'main',
                    url,
                    pipelineId,
                    buildStatus: SCM_STATE_MAP[build.status]
                });
                assert.calledWith(executorMock.startTimer, {
                    buildId,
                    jobId,
                    annotations,
                    provider,
                    startTime: build.startTime,
                    buildStatus: build.status,
                    pipelineId,
                    token: 'equivalentToOneQuarter'
                });
                assert.notCalled(executorMock.stop);
            });
        });

        it('skips pr commenting if meta summary key is not a string', () => {
            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'PR-5:main',
                pipeline: Promise.resolve({
                    id: pipelineId,
                    configPipelineId,
                    scmUri,
                    scmContext,
                    scmRepo,
                    admin: Promise.resolve(adminUser),
                    token: Promise.resolve('foo')
                }),
                permutations: [{ annotations, freezeWindows, provider }],
                isPR: sinon.stub().returns(true)
            });
            build.status = 'FAILURE';
            build.meta.meta.summary = {
                1: 3
            };

            return build.update().then(() => {
                assert.calledWith(executorMock.stop, {
                    buildId,
                    jobId,
                    annotations,
                    provider,
                    freezeWindows,
                    blockedBy: [jobId],
                    pipelineId,
                    token: 'equivalentToOneQuarter',
                    jobName: 'PR-5:main',
                    apiUri
                });

                // Completed step is not modified
                delete stepsMock[0].update;
                delete stepsMock[1].update;
                delete stepsMock[2].update;
                assert.deepEqual(stepsMock[0], step0);
                // In progress step is aborted
                assert.ok(stepsMock[1].endTime);
                assert.equal(stepsMock[1].code, 130);
                // Unstarted step is not modified
                assert.deepEqual(stepsMock[2], step2);
                assert.calledWith(scmMock.updateCommitStatus, {
                    token: 'foo',
                    scmUri,
                    scmContext,
                    scmRepo,
                    sha,
                    jobName: 'PR-5:main',
                    buildStatus: SCM_STATE_MAP.FAILURE,
                    url,
                    pipelineId
                });
                assert.notCalled(scmMock.addPrComment);
            });
        });

        it('skips custom status update if meta status field is not a JSON parseable string', () => {
            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'PR-5:main',
                pipeline: Promise.resolve({
                    id: pipelineId,
                    configPipelineId,
                    scmUri,
                    scmContext,
                    scmRepo,
                    admin: Promise.resolve(adminUser),
                    token: Promise.resolve('foo')
                }),
                permutations: [{ annotations, freezeWindows, provider }],
                isPR: sinon.stub().returns(true)
            });
            build.status = SCM_STATE_MAP.FAILURE;
            build.meta.meta.status = {
                findbugs: 'hello',
                snyk:
                    '{"status":"FAILURE","message":"23 package vulnerabilities found. ' +
                    'Previous count: 0 vulnerabilities."}'
            };
            delete build.meta.meta.summary;

            return build.update().then(() => {
                assert.calledWith(scmMock.updateCommitStatus.firstCall, {
                    token: 'foo',
                    scmUri,
                    scmContext,
                    scmRepo,
                    sha,
                    jobName: 'PR-5:main',
                    buildStatus: SCM_STATE_MAP.FAILURE,
                    url,
                    pipelineId
                });
                assert.calledWith(scmMock.updateCommitStatus.secondCall, {
                    token: 'foo',
                    scmUri,
                    scmContext,
                    scmRepo,
                    sha,
                    jobName: 'PR-5:main',
                    buildStatus: SCM_STATE_MAP.FAILURE,
                    url: 'https://display.com/some/endpoint/pipelines/1234/builds/9876',
                    pipelineId,
                    context: 'snyk',
                    description: '23 package vulnerabilities found. Previous count: 0 vulnerabilities.'
                });
                assert.notOk(scmMock.updateCommitStatus.thirdCall);
                assert.notCalled(scmMock.addPrComment);
            });
        });

        it('skips custom status update if meta status field is not an object or string', () => {
            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'PR-5:main',
                pipeline: Promise.resolve({
                    id: pipelineId,
                    configPipelineId,
                    scmUri,
                    scmContext,
                    scmRepo,
                    admin: Promise.resolve(adminUser),
                    token: Promise.resolve('foo')
                }),
                permutations: [{ annotations, freezeWindows, provider }],
                isPR: sinon.stub().returns(true)
            });
            build.status = 'FAILURE';
            build.meta.meta.status = {
                findbugs: 12345,
                snyk:
                    '{"status":"FAILURE","message":"23 package vulnerabilities found. ' +
                    'Previous count: 0 vulnerabilities."}'
            };
            delete build.meta.meta.summary;

            return build.update().then(() => {
                assert.calledWith(scmMock.updateCommitStatus.firstCall, {
                    token: 'foo',
                    scmUri,
                    scmContext,
                    scmRepo,
                    sha,
                    jobName: 'PR-5:main',
                    buildStatus: SCM_STATE_MAP.FAILURE,
                    url,
                    pipelineId
                });
                assert.calledWith(scmMock.updateCommitStatus.secondCall, {
                    token: 'foo',
                    scmUri,
                    scmContext,
                    scmRepo,
                    sha,
                    jobName: 'PR-5:main',
                    buildStatus: SCM_STATE_MAP.FAILURE,
                    url: 'https://display.com/some/endpoint/pipelines/1234/builds/9876',
                    pipelineId,
                    context: 'snyk',
                    description: '23 package vulnerabilities found. Previous count: 0 vulnerabilities.'
                });
                assert.notOk(scmMock.updateCommitStatus.thirdCall);
                assert.notCalled(scmMock.addPrComment);
            });
        });

        it('splits pr comment into multiple string', () => {
            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'PR-5:main',
                pipeline: Promise.resolve({
                    id: pipelineId,
                    configPipelineId,
                    scmUri,
                    scmContext,
                    scmRepo,
                    admin: Promise.resolve(adminUser),
                    token: Promise.resolve('foo')
                }),
                permutations: [{ annotations, freezeWindows, provider }],
                isPR: sinon.stub().returns(true)
            });
            build.status = 'FAILURE';
            build.meta = {
                meta: {
                    splitComments: true,
                    summary: {
                        coverage: 'Coverage increased by 15%',
                        markdown: 'this markdown comment is **bold** and *italic*'
                    }
                }
            };

            return build.update().then(() => {
                assert.calledWith(executorMock.stop, {
                    buildId,
                    jobId,
                    annotations,
                    provider,
                    freezeWindows,
                    blockedBy: [jobId],
                    pipelineId,
                    token: 'equivalentToOneQuarter',
                    jobName: 'PR-5:main',
                    apiUri
                });
                delete stepsMock[0].update;
                delete stepsMock[1].update;
                delete stepsMock[2].update;
                // Completed step is not modified
                assert.deepEqual(stepsMock[0], step0);
                // In progress step is aborted
                assert.ok(stepsMock[1].endTime);
                assert.equal(stepsMock[1].code, 130);
                // Unstarted step is not modified
                assert.deepEqual(stepsMock[2], step2);

                assert.calledWith(scmMock.updateCommitStatus, {
                    token: 'foo',
                    scmUri,
                    scmContext,
                    scmRepo,
                    sha,
                    jobName: 'PR-5:main',
                    buildStatus: SCM_STATE_MAP.FAILURE,
                    url,
                    pipelineId
                });
                assert.calledWith(scmMock.addPrComment, {
                    token: 'foo',
                    jobName: 'PR-5:main',
                    scmContext,
                    scmRepo,
                    scmUri,
                    pipelineId,
                    comments: [
                        {
                            text:
                                '### SD Build [#9876](https://display.com/some/' +
                                'endpoint/pipelines/1234/builds/9876) Job PR-5:main\n_node:4_\n- - - -\n' +
                                '__coverage__ - Coverage increased by 15%\n\n' +
                                '###### ~ Screwdriver automated build summary',
                            keyword: 'coverage'
                        },
                        {
                            text:
                                '### SD Build [#9876](https://display.com/some/' +
                                'endpoint/pipelines/1234/builds/9876) Job PR-5:main\n_node:4_\n- - - -\n' +
                                '__markdown__ - this markdown comment is **bold** and *italic*\n\n' +
                                '###### ~ Screwdriver automated build summary',
                            keyword: 'markdown'
                        }
                    ],
                    prNum: 5
                });
            });
        });
    });

    describe('remove', () => {
        let stepsMock;

        beforeEach(() => {
            const step0Mock = { remove: sinon.stub().resolves({}) };
            const step1Mock = { remove: sinon.stub().resolves({}) };
            const step2Mock = { remove: sinon.stub().resolves({}) };

            stepsMock = [step0Mock, step1Mock, step2Mock];
            datastore.remove.resolves({});
            stepFactoryMock.list.resolves(stepsMock);
            jobFactoryMock.get.resolves(jobMock);
        });

        it('removes build and build steps', () => {
            return build.remove().then(() => {
                assert.calledOnce(stepFactoryMock.removeSteps); // remove steps in one shot
                assert.calledOnce(datastore.remove); // remove the build
            });
        });

        it('removes build and build steps and stageBuild', () => {
            const stageBuildMock = {
                remove: sinon.stub().resolves({})
            };

            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'stage@main:setup',
                pipeline: Promise.resolve({
                    id: pipelineId,
                    configPipelineId,
                    scmUri,
                    scmContext,
                    admin: Promise.resolve(adminUser),
                    token: Promise.resolve('foo')
                }),
                isPR: sinon.stub().returns(false)
            });
            stageBuildFactoryMock.get.resolves(stageBuildMock);

            return build.remove().then(() => {
                assert.calledOnce(stepFactoryMock.removeSteps); // remove steps in one shot
                assert.calledOnce(datastore.remove); // remove the build
                assert.calledOnce(stageBuildMock.remove); // remove the build
            });
        });

        it('fails if removeSteps returns error', () => {
            stepFactoryMock.removeSteps.rejects(new Error('error removing step'));

            return build
                .remove()
                .then(() => {
                    assert.fail('should not get here');
                })
                .catch(err => {
                    assert.isOk(err);
                    assert.equal(err.message, 'error removing step');
                });
        });
    });

    describe('stop', () => {
        beforeEach(() => {
            executorMock.stop.resolves(null);
            jobFactoryMock.get.resolves(jobMock);
        });

        it('promises to stop a build', () =>
            build.stop().then(() => {
                assert.calledWith(executorMock.stop, {
                    buildId,
                    jobId,
                    annotations,
                    provider,
                    freezeWindows,
                    blockedBy: [jobId],
                    pipelineId,
                    token: 'equivalentToOneQuarter',
                    jobName,
                    apiUri
                });
            }));

        it('stops timer in executor when build is stopped', () => {
            build.status = 'SUCCESS';

            build.stop().then(() => {
                assert.calledWith(executorMock.stop, {
                    buildId,
                    jobId,
                    annotations,
                    provider,
                    freezeWindows,
                    blockedBy: [jobId],
                    pipelineId,
                    token: 'equivalentToOneQuarter',
                    jobName,
                    apiUri
                });
                assert.calledWith(executorMock.stopTimer, {
                    buildId,
                    jobId,
                    annotations,
                    provider,
                    freezeWindows,
                    blockedBy: [jobId],
                    pipelineId,
                    token: 'equivalentToOneQuarter'
                });
            });
        });

        it('passes buildClusterName to executor when it exists', () => {
            build.buildClusterName = 'sd';

            return build.stop().then(() => {
                assert.calledWith(executorMock.stop, {
                    buildId,
                    buildClusterName: 'sd',
                    jobId,
                    annotations,
                    provider,
                    freezeWindows,
                    blockedBy: [jobId],
                    pipelineId,
                    token: 'equivalentToOneQuarter',
                    jobName,
                    apiUri
                });
            });
        });

        it('rejects on executor failure', () => {
            const expectedError = new Error('cantStopTheRock');

            executorMock.stop.rejects(expectedError);

            return build
                .stop()
                .then(() => {
                    assert.fail('This should not fail the test');
                })
                .catch(err => {
                    assert.deepEqual(err, expectedError);
                });
        });
    });

    describe('isDone', () => {
        beforeEach(() => {
            build = new BuildModel(config);
        });
        it('returns true if the build is done', () => {
            build.status = 'ABORTED';
            assert.isTrue(build.isDone());
        });

        it('returns false if the build is not done', () => {
            build.status = 'RUNNING';
            assert.isFalse(build.isDone());
        });

        it('returns true if the build is UNSTABLE and has endTime', () => {
            build.status = 'UNSTABLE';
            build.endTime = '2018-06-27T18:22:20.153Z';
            assert.isTrue(build.isDone());
        });

        it('returns true if the build is UNSTABLE and no endTime', () => {
            build.status = 'UNSTABLE';
            assert.isFalse(build.isDone());
        });
    });

    describe('start', () => {
        let sandbox;
        const prParentJobId = 1000;
        let pipelineMockB = {
            id: pipelineId,
            name: 'd2lam/test',
            configPipelineId,
            scmUri,
            scmContext,
            scmRepo,
            admin: Promise.resolve(adminUser),
            token: Promise.resolve('foo')
        };
        const externalPid1 = 101;
        const externalPid2 = 202;
        const externalJob1 = {
            name: 'externalJob1',
            id: 111,
            isPR: () => false,
            parsePRJobName: sinon.stub().returns(null)
        };
        const pipeline1 = {
            id: externalPid1,
            getJobs: sinon
                .stub()
                .resolves([
                    { id: 999, name: 'somejob', isPR: () => false, parsePRJobName: sinon.stub().returns(null) },
                    externalJob1
                ])
        };
        const internalJob = {
            name: 'internalJob',
            id: 333,
            isPR: () => false,
            parsePRJobName: sinon.stub().returns(null)
        };
        let expectedExecutorStartConfig;
        let expectedUpdateCommitStatusConfig;

        beforeEach(() => {
            sandbox = sinon.createSandbox();
            sandbox.useFakeTimers(now);
            executorMock.start.resolves(null);
            jobFactoryMock.get.resolves({
                id: jobId,
                archived: false,
                state: 'ENABLED',
                prParentJobId,
                name: 'main',
                pipeline: Promise.resolve(pipelineMockB),
                permutations: [{ annotations, freezeWindows, provider }],
                isPR: () => false,
                prNum: Promise.resolve(null)
            });
            expectedExecutorStartConfig = {
                build,
                causeMessage,
                eventId,
                jobId,
                jobName,
                jobState,
                jobArchived,
                annotations,
                provider,
                freezeWindows,
                blockedBy: [jobId],
                apiUri,
                buildId,
                container,
                token,
                pipeline: {
                    id: pipelineMockB.id,
                    name: pipelineMockB.name,
                    scmContext: pipelineMockB.scmContext,
                    configPipelineId: pipelineMockB.configPipelineId
                },
                tokenGen,
                pipelineId,
                isPR: false,
                prParentJobId
            };
            expectedUpdateCommitStatusConfig = {
                token: 'foo',
                scmUri,
                scmContext,
                scmRepo,
                sha,
                jobName: 'main',
                buildStatus: SCM_STATE_MAP.QUEUED,
                url,
                pipelineId
            };
            build.initMeta = sinon.stub().resolves();
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('promises to start a build', () =>
            build.start().then(() => {
                assert.calledWith(executorMock.start, expectedExecutorStartConfig);

                assert.calledWith(
                    tokenGen,
                    buildId,
                    {
                        isPR: false,
                        jobId,
                        pipelineId,
                        configPipelineId,
                        eventId,
                        prParentJobId
                    },
                    scmContext,
                    TEMPORAL_JWT_TIMEOUT
                );

                assert.calledWith(scmMock.updateCommitStatus, expectedUpdateCommitStatusConfig);
                assert.calledOnce(build.initMeta);
            }));

        it('passes template info to executor if it exists', () => {
            templateFactoryMock.get.resolves(templateMock);

            build.templateId = templateMock.id;
            expectedExecutorStartConfig.template = {
                id: templateMock.id,
                fullName: `${templateMock.namespace}/${templateMock.name}`,
                name: templateMock.name,
                namespace: templateMock.namespace
            };

            return build.start().then(() => {
                assert.calledWith(executorMock.start, expectedExecutorStartConfig);

                assert.calledWith(
                    tokenGen,
                    buildId,
                    {
                        isPR: false,
                        jobId,
                        pipelineId,
                        configPipelineId,
                        eventId,
                        prParentJobId
                    },
                    scmContext,
                    TEMPORAL_JWT_TIMEOUT
                );

                assert.calledWith(scmMock.updateCommitStatus, expectedUpdateCommitStatusConfig);
            });
        });

        it('passes buildClusterName to executor if it exists', () => {
            build.buildClusterName = 'sd';
            expectedExecutorStartConfig.buildClusterName = 'sd';

            return build.start().then(() => {
                assert.calledWith(executorMock.start, expectedExecutorStartConfig);

                assert.calledWith(
                    tokenGen,
                    buildId,
                    {
                        isPR: false,
                        jobId,
                        pipelineId,
                        configPipelineId,
                        eventId,
                        prParentJobId
                    },
                    scmContext,
                    TEMPORAL_JWT_TIMEOUT
                );

                assert.calledWith(scmMock.updateCommitStatus, expectedUpdateCommitStatusConfig);
            });
        });

        it('passes causeMessage to executor if it exists', () => {
            expectedExecutorStartConfig.causeMessage = '[force start] Push out hotfix';

            return build
                .start({
                    causeMessage: '[force start] Push out hotfix'
                })
                .then(() => {
                    assert.calledWith(executorMock.start, expectedExecutorStartConfig);

                    assert.calledWith(
                        tokenGen,
                        buildId,
                        {
                            isPR: false,
                            jobId,
                            pipelineId,
                            configPipelineId,
                            eventId,
                            prParentJobId
                        },
                        scmContext,
                        TEMPORAL_JWT_TIMEOUT
                    );

                    assert.calledWith(scmMock.updateCommitStatus, expectedUpdateCommitStatusConfig);
                });
        });

        it('get internal blockedby job Ids and pass to executor start', () => {
            const blocking1 = {
                name: 'blocking1',
                id: 111,
                isPR: () => false,
                parsePRJobName: sinon.stub().returns(null)
            };
            const blocking2 = {
                name: 'blocking2',
                id: 222,
                isPR: () => false,
                parsePRJobName: sinon.stub().returns(null)
            };
            const prJob = {
                name: `PR-999:${blocking2.name}`,
                isPR: () => true,
                id: 333,
                parsePRJobName: sinon.stub().returns('blocking2')
            };

            pipelineMockB = {
                id: pipelineId,
                name: 'd2lam/test',
                scmUri,
                scmContext,
                admin: Promise.resolve(adminUser),
                token: Promise.resolve('foo'),
                getJobs: sinon.stub().resolves([
                    { id: jobId, name: 'main', isPR: () => false, parsePRJobName: sinon.stub().returns(null) },
                    blocking1,
                    { id: 123, name: 'somejob', isPR: () => false, parsePRJobName: sinon.stub().returns(null) },
                    blocking2,
                    {
                        id: 456,
                        name: 'someotherjob',
                        isPR: () => false,
                        parsePRJobName: sinon.stub().returns(null)
                    },
                    prJob
                ])
            };

            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'main',
                state: 'ENABLED',
                archived: false,
                pipeline: Promise.resolve(pipelineMockB),
                permutations: [
                    {
                        annotations,
                        provider,
                        freezeWindows,
                        blockedBy: [blocking1.name, blocking2.name]
                    }
                ],
                isPR: () => true,
                prParentJobId,
                parsePRJobName: sinon.stub().returns('main'),
                prNum: Promise.resolve(null)
            });
            expectedExecutorStartConfig.blockedBy = [jobId, blocking1.id, blocking2.id, prJob.id];
            expectedExecutorStartConfig.isPR = true;
            expectedExecutorStartConfig.pipeline.configPipelineId = pipelineMockB.configPipelineId;

            return build.start().then(() => {
                assert.calledWith(executorMock.start, expectedExecutorStartConfig);
            });
        });

        it('get external blockedby job Ids and pass to executor start', () => {
            const externalJob2 = {
                name: 'externalJob2',
                id: 222,
                isPR: () => false,
                parsePRJobName: sinon.stub().returns(null)
            };

            const pipeline2 = {
                id: externalPid2,
                getJobs: sinon.stub().resolves([
                    {
                        id: 888,
                        name: 'somerandomjob',
                        isPR: () => false,
                        parsePRJobName: sinon.stub().returns(null)
                    },
                    externalJob2
                ])
            };

            pipelineFactoryMock.get.withArgs(externalPid1).resolves(pipeline1);
            pipelineFactoryMock.get.withArgs(externalPid2).resolves(pipeline2);

            pipelineMockB = {
                id: pipelineId,
                name: expectedExecutorStartConfig.pipeline.name,
                scmUri,
                scmContext,
                configPipelineId,
                admin: Promise.resolve(adminUser),
                token: Promise.resolve('foo'),
                getJobs: sinon.stub().resolves([
                    { id: jobId, name: 'main', isPR: () => false, parsePRJobName: sinon.stub().returns(null) },
                    { id: 123, name: 'somejob', isPR: () => false, parsePRJobName: sinon.stub().returns(null) },
                    {
                        id: internalJob.id,
                        name: internalJob.name,
                        isPR: () => false,
                        parsePRJobName: sinon.stub().returns(null)
                    }
                ])
            };

            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'main',
                state: 'ENABLED',
                archived: false,
                pipeline: Promise.resolve(pipelineMockB),
                permutations: [
                    {
                        annotations,
                        provider,
                        freezeWindows,
                        blockedBy: [
                            `~sd@${externalPid1}:externalJob1`,
                            `~${internalJob.name}`,
                            `~sd@${externalPid2}:externalJob2`
                        ]
                    }
                ],
                isPR: () => false,
                parsePRJobName: sinon.stub().returns(null),
                prNum: Promise.resolve(null)
            });

            expectedExecutorStartConfig.blockedBy = [jobId, internalJob.id, externalJob1.id, externalJob2.id];
            expectedExecutorStartConfig.prParentJobId = undefined;
            expectedExecutorStartConfig.pipeline.configPipelineId = pipelineMockB.configPipelineId;

            return build.start().then(() => {
                assert.calledWith(executorMock.start, expectedExecutorStartConfig);
            });
        });

        it('gets external blockedby job Ids and pass to executor start even if pipeline does not exist', () => {
            pipelineFactoryMock.get.withArgs(externalPid1).resolves(pipeline1);
            pipelineFactoryMock.get.withArgs(externalPid2).resolves(null);

            pipelineMockB = {
                id: pipelineId,
                name: expectedExecutorStartConfig.pipeline.name,
                scmUri,
                scmContext,
                configPipelineId,
                admin: Promise.resolve(adminUser),
                token: Promise.resolve('foo'),
                getJobs: sinon.stub().resolves([
                    { id: jobId, name: 'main', isPR: () => false, parsePRJobName: sinon.stub().returns(null) },
                    { id: 123, name: 'somejob', isPR: () => false, parsePRJobName: sinon.stub().returns(null) },
                    {
                        id: internalJob.id,
                        name: internalJob.name,
                        isPR: () => false,
                        parsePRJobName: sinon.stub().returns(null)
                    }
                ])
            };

            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'main',
                state: 'ENABLED',
                archived: false,
                pipeline: Promise.resolve(pipelineMockB),
                permutations: [
                    {
                        annotations,
                        provider,
                        freezeWindows,
                        blockedBy: [
                            `~sd@${externalPid1}:externalJob1`,
                            `~${internalJob.name}`,
                            `~sd@${externalPid2}:externalJob2`
                        ]
                    }
                ],
                isPR: () => false,
                parsePRJobName: sinon.stub().returns(null),
                prNum: Promise.resolve(null)
            });
            expectedExecutorStartConfig.blockedBy = [jobId, internalJob.id, externalJob1.id];
            expectedExecutorStartConfig.prParentJobId = undefined;
            expectedExecutorStartConfig.pipeline.configPipelineId = pipelineMockB.configPipelineId;

            return build.start().then(() => {
                assert.calledWith(executorMock.start, expectedExecutorStartConfig);
            });
        });

        it('promises to start a build with the executor specified in job annotations', () => {
            pipelineMockB = {
                id: pipelineId,
                name: expectedExecutorStartConfig.pipeline.name,
                configPipelineId,
                scmUri,
                scmContext,
                scmRepo,
                admin: Promise.resolve(adminUser),
                token: Promise.resolve('foo')
            };

            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'main',
                state: 'ENABLED',
                archived: false,
                pipeline: Promise.resolve(pipelineMockB),
                permutations: [{ annotations: { 'beta.screwdriver.cd/executor:': 'k8s-test' }, provider }],
                isPR: () => false,
                prNum: Promise.resolve(null)
            });
            expectedExecutorStartConfig.annotations = { 'beta.screwdriver.cd/executor:': 'k8s-test' };
            expectedExecutorStartConfig.prParentJobId = undefined;
            expectedExecutorStartConfig.freezeWindows = [];

            return build.start().then(() => {
                assert.calledWith(executorMock.start, expectedExecutorStartConfig);

                assert.calledWith(
                    tokenGen,
                    buildId,
                    {
                        isPR: false,
                        jobId,
                        pipelineId,
                        eventId,
                        configPipelineId
                    },
                    scmContext,
                    TEMPORAL_JWT_TIMEOUT
                );

                assert.calledWith(scmMock.updateCommitStatus, expectedUpdateCommitStatusConfig);
            });
        });

        it('rejects when the executor fails', () => {
            const expectedError = new Error('brokenGun');

            executorMock.start.rejects(expectedError);

            return build
                .start()
                .then(() => {
                    assert.fail('This should not fail the test');
                })
                .catch(err => {
                    assert.deepEqual(err, expectedError);
                });
        });
    });

    describe('secrets', () => {
        beforeEach(() => {
            jobFactoryMock.get.resolves({
                id: jobId,
                name: 'main',
                secrets: Promise.resolve([
                    {
                        name: 'NORMAL',
                        value: 'value',
                        allowInPR: true
                    }
                ]),
                isPR: () => false
            });
        });

        it('returns the list of secrets', () =>
            build.secrets.then(secrets => {
                assert.isArray(secrets);
                assert.equal(secrets.length, 1);
            }));

        it('throws error if job missing', () => {
            jobFactoryMock.get.resolves(null);

            return build.secrets
                .then(() => {
                    assert.fail('nope');
                })
                .catch(err => {
                    assert.equal('Job does not exist', err.message);
                });
        });
    });

    describe('job', () => {
        it('has a job getter', () => {
            jobFactoryMock.get.resolves(null);
            // when we fetch a job it resolves to a promise
            assert.isFunction(build.job.then);
            // and a factory is called to create that promise
            assert.calledWith(jobFactoryMock.get, jobId);

            // When we call build.job again it is still a promise
            assert.isFunction(build.job.then);
            // ...but the factory was not recreated, since the promise is stored
            // as the model's pipeline property, now
            assert.calledOnce(jobFactoryMock.get);
        });
    });

    describe('pipeline', () => {
        it('has a pipeline getter', () => {
            jobMock = {
                pipeline: Promise.resolve({})
            };

            jobFactoryMock.get.resolves(jobMock);
            // when we fetch a pipeline it resolves to a promise
            assert.isFunction(build.pipeline.then);
            // job resolves that promise
            assert.calledWith(jobFactoryMock.get, jobId);

            // When we call build.pipeline again it is still a promise
            assert.isFunction(build.pipeline.then);
            // ...but the job need not be bothered
            // as the model's pipeline property, now
            assert.calledOnce(jobFactoryMock.get);
        });

        it('rejects if pipeline is null', () => {
            jobMock = {
                pipeline: Promise.resolve(null)
            };

            jobFactoryMock.get.resolves(jobMock);

            return build.pipeline
                .then(() => {
                    assert.fail('should not get here');
                })
                .catch(err => {
                    assert.instanceOf(err, Error);
                    assert.strictEqual(err.message, 'Pipeline does not exist');
                });
        });

        it('rejects if job is null', () => {
            jobFactoryMock.get.resolves(null);

            return build.pipeline
                .then(() => {
                    assert.fail('should not get here');
                })
                .catch(err => {
                    assert.instanceOf(err, Error);
                    assert.strictEqual(err.message, 'Job does not exist');
                });
        });
    });

    describe('getSteps', () => {
        it('use the default config when not passed in', () => {
            const expected = {
                params: {
                    buildId
                }
            };

            return build.getSteps().then(() => {
                assert.calledWith(stepFactoryMock.list, expected);
            });
        });
    });

    describe('get metrics', () => {
        const step1 = {
            id: 11,
            buildId,
            name: 'sd-setup-init',
            startTime: '2019-01-22T21:08:00.000Z',
            endTime: '2019-01-22T21:30:00.000Z',
            code: 0
        };
        const step2 = {
            id: 12,
            buildId,
            name: 'sd-setup-scm',
            startTime: '2019-01-22T21:21:00.000Z',
            endTime: '2019-01-22T22:30:00.000Z',
            code: 127
        };
        const step3 = {
            name: 'install',
            startTime: '2019-01-22T21:31:00.000Z',
            endTime: '2019-01-22T22:35:00.000Z',
            code: 127
        };
        const duration1 = (new Date(step1.endTime) - new Date(step1.startTime)) / 1000;
        const duration2 = (new Date(step2.endTime) - new Date(step2.startTime)) / 1000;
        const duration3 = (new Date(step3.endTime) - new Date(step3.startTime)) / 1000;
        let metrics;
        let stepsMock;

        beforeEach(() => {
            stepsMock = [step1, step2, step3];
            stepFactoryMock.list.resolves(stepsMock);

            metrics = [
                {
                    id: step1.id,
                    name: step1.name,
                    code: step1.code,
                    duration: duration1,
                    createTime: build.createTime
                },
                {
                    id: step2.id,
                    name: step2.name,
                    code: step2.code,
                    duration: duration2,
                    createTime: build.createTime
                },
                {
                    id: undefined,
                    name: step3.name,
                    code: step3.code,
                    duration: duration3,
                    createTime: build.createTime
                }
            ];
        });

        it('generates metrics', () => build.getMetrics().then(m => assert.deepEqual(m, metrics)));

        it('does not fail if empty steps', () => {
            stepFactoryMock.list.resolves([]);

            return build.getMetrics().then(m => assert.deepEqual(m, []));
        });

        it('works with no startTime or endTime params passed in', () => {
            const stepName = 'sd-setup-scm';

            metrics = metrics.filter(m => m.name === stepName);

            return build.getMetrics({ stepName }).then(m => {
                assert.deepEqual(m, metrics);
            });
        });
    });

    describe('get JSON with steps', () => {
        const step1 = {
            id: 11,
            buildId,
            name: 'install',
            startTime: '2019-01-22T21:31:00.000Z',
            endTime: '2019-01-22T22:35:00.000Z',
            code: 0
        };
        const step2 = {
            id: 12,
            buildId,
            name: 'sd-setup-init',
            startTime: '2019-01-22T21:08:00.000Z',
            endTime: '2019-01-22T21:30:00.000Z',
            code: 127
        };
        const step3 = {
            name: 'sd-setup-scm',
            startTime: '2019-01-22T21:21:00.000Z',
            endTime: '2019-01-22T22:30:00.000Z',
            code: 127
        };
        let stepsMock;

        beforeEach(() => {
            stepsMock = [step1, step2, step3];
            stepFactoryMock.list.resolves(stepsMock);
        });

        it('returns the JSON with steps sorted by step.id', () =>
            build.toJsonWithSteps().then(json => {
                const expected = { ...build.toJson(), steps: [step1, step2, step3] };

                assert.deepStrictEqual(json, expected);
            }));

        it('always returns the JSON with steps sorted by step.id', () => {
            const configWithEndTime = { ...config };

            configWithEndTime.endTime = '2019-01-22T22:30: 00.000Z';
            build = new BuildModel(configWithEndTime);

            return build.toJsonWithSteps().then(json => {
                const expected = { ...build.toJson(), steps: [step1, step2, step3] };

                assert.deepStrictEqual(json, expected);
            });
        });

        it('throws error if steps missing ', () => {
            stepFactoryMock.list.resolves([]);

            return build
                .toJsonWithSteps()
                .then(() => assert.fail('nope'))
                .catch(err => assert.equal('Steps do not exist', err.message));
        });
    });

    describe('stopFrozen', () => {
        const previousStatus = 'FROZEN';

        beforeEach(() => {
            executorMock.stopFrozen.resolves(null);
            jobFactoryMock.get.resolves(jobMock);
        });

        it('promises to stop a frozen build', () =>
            build.stopFrozen(previousStatus).then(() => {
                assert.calledWith(executorMock.stopFrozen, {
                    buildId,
                    jobId,
                    pipelineId,
                    provider,
                    token: 'equivalentToOneQuarter',
                    status: previousStatus
                });
            }));

        it('rejects on executor failure', () => {
            const expectedError = new Error('cantStopTheRock');

            executorMock.stopFrozen.rejects(expectedError);

            return build
                .stopFrozen(previousStatus)
                .then(() => {
                    assert.fail('This should not fail the test');
                })
                .catch(err => {
                    assert.deepEqual(err, expectedError);
                });
        });
    });

    describe('unzipArtifacts', () => {
        beforeEach(() => {
            executorMock.unzipArtifacts.resolves(null);
            jobFactoryMock.get.resolves(jobMock);
            pipelineFactoryMock.get.resolves(pipelineMock);
        });

        it('promises to unzip a ZIP of artifacts', () =>
            build.unzipArtifacts().then(() => {
                assert.calledWith(executorMock.unzipArtifacts, {
                    buildId,
                    token
                });
            }));
    });

    describe('initMeta', () => {
        beforeEach(() => {
            build.meta = {
                meta: {
                    remainMeta: 'This meta should not be deleted',
                    // This should be deleted
                    summary: {
                        coverage: 'Coverage increased by 15%',
                        markdown: 'This markdown comment is **bold** and *italic*'
                    }
                }
            };
            // Stub build.update to ensure it's only executed in initMeta()
            build.update = sinon.stub().resolves();
            // Mock the job associated with the build
            jobFactoryMock.get.withArgs(777).resolves({
                id: 777,
                name: 'thisJob',
                pipelineId: 1234
            });
        });

        it('sets default metadata when starting the pipeline without any specific metadata', () => {
            // Mock event without metadata
            eventFactoryMock.get.withArgs(555).resolves({
                creator: { username: 'St John' }
            });

            const expected = {
                meta: { remainMeta: 'This meta should not be deleted' },
                build: {
                    pipelineId: '1234',
                    eventId: '555',
                    jobId: '777',
                    buildId: '9876',
                    jobName: 'thisJob',
                    sha: 'ccc49349d3cffbd12ea9e3d41521480b4aa5de5f'
                },
                event: { creator: 'St John' }
            };

            return build.initMeta().then(() => {
                assert.calledOnce(build.update);
                assert.deepEqual(build.meta, expected);
            });
        });

        it('merges metadata giving precedence to the latest parent builds, event, and parent event', () => {
            build.parentBuildId = [8000, 8001, 9000, 9001, 9002];

            // Mock parent event with metadata
            eventFactoryMock.get.withArgs(444).resolves({
                meta: {
                    meta1: 'set by parent event', // Overwritten by parent build
                    meta2: 'set by parent event', // Overwritten by parent build
                    meta3: 'set by parent event', // Overwritten by own event
                    meta4: 'set by parent event' // Remains
                }
            });
            // Mock own event with metadata
            eventFactoryMock.get.withArgs(555).resolves({
                parentEventId: 444,
                meta: {
                    meta1: 'set by own event', // Overwritten by parent build
                    meta2: 'set by own event', // Overwritten by parent build
                    meta3: 'set by own event' // Remains
                },
                creator: { username: 'St John' }
            });
            // Mock parent builds with metadata
            buildFactoryMock.list
                .withArgs({
                    params: { id: build.parentBuildId }
                })
                .resolves([
                    {
                        id: 8000,
                        jobId: 800,
                        endTime: '2025-01-01T08:00:00.000Z',
                        meta: {
                            meta1: 'set by second newest parent build', // Overwritten by the newest parent build
                            meta2: 'set by second newest parent build', // Remains
                            parameters: { param1: 'set by second newest parent build' } // Remains
                        }
                    },
                    {
                        id: 8001,
                        jobId: 801,
                        endTime: '2025-01-01T09:00:00.000Z',
                        meta: {
                            meta1: 'set by the newest parent build' // Remains
                        }
                    },
                    {
                        id: 9000,
                        jobId: 900,
                        endTime: '2025-01-01T10:00:00.000Z',
                        meta: {
                            meta5: 'set by the external parent build 1', // Overwritten by the newest parent external build
                            parameters: { param2: 'set by external parent build 1' } // This should be deleted
                        }
                    },
                    {
                        id: 9001,
                        jobId: 901,
                        endTime: '2025-01-01T11:00:00.000Z',
                        meta: {
                            meta5: 'set by the external parent build 2' // Remains
                        }
                    },
                    {
                        id: 9002,
                        jobId: 902,
                        endTime: '2025-01-01T10:30:00.000Z',
                        meta: {
                            meta5: 'set by the external parent build 3' // Overwritten by the newest parent external build
                        }
                    }
                ]);
            // Mock job of the parent build
            jobFactoryMock.get.withArgs(800).resolves({
                pipelineId: 1234
            });
            jobFactoryMock.get.withArgs(801).resolves({
                pipelineId: 1234
            });
            // Mock job of the parent external build
            jobFactoryMock.get.withArgs(900).resolves({
                pipelineId: 2345,
                name: 'externalJob1'
            });
            jobFactoryMock.get.withArgs(901).resolves({
                pipelineId: 2345,
                name: 'externalJob2'
            });
            jobFactoryMock.get.withArgs(902).resolves({
                pipelineId: 2346,
                name: 'externalJob1'
            });

            const expected = {
                meta: { remainMeta: 'This meta should not be deleted' },
                meta1: 'set by the newest parent build',
                meta2: 'set by second newest parent build',
                meta3: 'set by own event',
                meta4: 'set by parent event',
                parameters: { param1: 'set by second newest parent build' },
                sd: {
                    2345: {
                        externalJob1: { meta5: 'set by the external parent build 1' },
                        externalJob2: { meta5: 'set by the external parent build 2' }
                    },
                    2346: { externalJob1: { meta5: 'set by the external parent build 3' } }
                },
                meta5: 'set by the external parent build 2',
                build: {
                    pipelineId: '1234',
                    eventId: '555',
                    jobId: '777',
                    buildId: '9876',
                    jobName: 'thisJob',
                    sha: 'ccc49349d3cffbd12ea9e3d41521480b4aa5de5f'
                },
                event: { creator: 'St John' }
            };

            return build.initMeta().then(() => {
                assert.deepEqual(build.meta, expected);
            });
        });

        it('restarts build with parameters changed from the previous event', () => {
            build.parentBuildId = [8000];
            build.meta.parameters = { param1: 'set by restart event' }; // Remains

            // Mock parent event with parameter
            eventFactoryMock.get.withArgs(444).resolves({
                meta: {
                    parameters: { param1: 'set by source event' } // Overwritten by own build
                }
            });
            // Mock own event with parameter
            eventFactoryMock.get.withArgs(555).resolves({
                parentEventId: 444,
                meta: {
                    parameters: { param1: 'set by restart event' } // Overwritten by own build
                },
                creator: { username: 'St John' }
            });
            // Mock parent builds with parameter
            buildFactoryMock.list
                .withArgs({
                    params: { id: build.parentBuildId }
                })
                .resolves([
                    {
                        id: 8000,
                        jobId: 800,
                        endTime: '2025-01-01T08:00:00.000Z',
                        meta: {
                            parameters: { param1: 'set by source event' } // Overwritten by own build
                        }
                    }
                ]);
            // Mock job of the parent build executed by source event
            jobFactoryMock.get.withArgs(800).resolves({
                pipelineId: 1234
            });

            const expected = {
                meta: { remainMeta: 'This meta should not be deleted' },
                parameters: { param1: 'set by restart event' },
                build: {
                    pipelineId: '1234',
                    eventId: '555',
                    jobId: '777',
                    buildId: '9876',
                    jobName: 'thisJob',
                    sha: 'ccc49349d3cffbd12ea9e3d41521480b4aa5de5f'
                },
                event: { creator: 'St John' }
            };

            return build.initMeta().then(() => {
                assert.deepEqual(build.meta, expected);
            });
        });
    });
});
