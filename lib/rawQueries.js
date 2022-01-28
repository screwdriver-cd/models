'use strict';

const Queries = {
    // getBuildStatuses()
    getStatusesQuery: (tablePrefix = '') => `SELECT "id", "jobId", "status", "startTime", "endTime"
        FROM (SELECT "id", "jobId", "status", "startTime", "endTime",
        RANK() OVER ( PARTITION BY "jobId" ORDER BY "id" DESC ) AS rank
        FROM "${tablePrefix}builds" WHERE "jobId" in (:jobIds)) as R
        WHERE rank > :offset AND rank <= :maxRank
        ORDER BY "jobId", "id" ASC`,

    getStatusesQueryMySql: (tablePrefix = '') => `SELECT id, jobId, status, startTime, endTime FROM (
	    SELECT a.id, a.jobId, a.status, a.startTime,  a.endTime, count(b.id) AS rank
		FROM  \`${tablePrefix}builds\` a LEFT JOIN (SELECT id, jobId FROM \`${tablePrefix}builds\` WHERE jobId IN (:jobIds)) b
                ON a.id<=b.id AND a.jobId=b.jobId
            WHERE a.jobId IN (:jobIds)
            GROUP BY a.jobId, a.id) AS R
        WHERE rank > :offset AND rank <= :maxRank
            ORDER BY jobId, id ASC`,

    // getLatestBuilds()
    getLatestBuildQuery: (tablePrefix = '') => `SELECT * FROM (
        SELECT *, RANK() OVER ( PARTITION BY "jobId" ORDER BY "id" DESC ) AS rank
        FROM "${tablePrefix}builds" WHERE "eventId" in (SELECT "id" FROM "${tablePrefix}events" WHERE "groupEventId" = (:groupEventId))) AS events
        WHERE rank = 1
        ORDER BY "jobId", "id" DESC`,

    getLatestBuildQueryMySql: (tablePrefix = '') =>
        `SELECT id, environment, eventId, jobId, parentBuildId, number, container, cause, sha,
                commit, createTime, startTime, endTime, parameters, meta, status, statusMessage,
                buildClusterName, stats, parentBuilds, templateId FROM (
        SELECT a.id, a.environment, a.eventId, a.jobId, a.parentBuildId, a.number, a.container, a.cause, a.sha,
                a.commit, a.createTime, a.startTime, a.endTime, a.parameters, a.meta, a.status, a.statusMessage,
                a.buildClusterName, a.stats, a.parentBuilds, a.templateId, count(b.id) AS rank
        FROM \`${tablePrefix}builds\` a LEFT JOIN (SELECT id, jobId FROM \`${tablePrefix}builds\` WHERE eventId IN
                                    (SELECT id FROM \`${tablePrefix}events\` WHERE groupEventId = :groupEventId)) b
                ON a.id<=b.id AND a.jobId=b.jobId
            WHERE a.eventId IN (SELECT id FROM \`${tablePrefix}events\` WHERE groupEventId = :groupEventId)
            GROUP BY a.jobId, a.id) as R
        WHERE rank=1
        ORDER BY jobId, id DESC`,

    // removeSteps()
    deleteBuildStepsQuery: (tablePrefix = '') => `DELETE FROM "${tablePrefix}steps" WHERE "buildId" = :buildId`,
    deleteBuildStepsQueryMySql: (tablePrefix = '') => `DELETE FROM \`${tablePrefix}steps\` WHERE buildId = :buildId`
};

const QUERY_MAPPINGS = {
    STATUS_QUERY: Symbol('status_query'),
    LATEST_BUILD_QUERY: Symbol('latest build'),
    DELETE_STEPS_QUERY: Symbol('delete steps')
};

const getQueries = (tablePrefix, querylabel) => {
    switch (querylabel) {
        case QUERY_MAPPINGS.STATUS_QUERY:
            return [
                { dbType: 'postgres', query: Queries.getStatusesQuery(tablePrefix) },
                { dbType: 'sqlite', query: Queries.getStatusesQuery(tablePrefix) },
                { dbType: 'mysql', query: Queries.getStatusesQueryMySql(tablePrefix) }
            ];
        case QUERY_MAPPINGS.LATEST_BUILD_QUERY:
            return [
                { dbType: 'postgres', query: Queries.getLatestBuildQuery(tablePrefix) },
                { dbType: 'sqlite', query: Queries.getLatestBuildQuery(tablePrefix) },
                { dbType: 'mysql', query: Queries.getLatestBuildQueryMySql(tablePrefix) }
            ];
        case QUERY_MAPPINGS.DELETE_STEPS_QUERY:
            return [
                { dbType: 'postgres', query: Queries.deleteBuildStepsQuery(tablePrefix) },
                { dbType: 'sqlite', query: Queries.deleteBuildStepsQuery(tablePrefix) },
                { dbType: 'mysql', query: Queries.deleteBuildStepsQueryMySql(tablePrefix) }
            ];
        default:
            throw new Error('Unsupported Raw Query');
    }
};

module.exports = {
    Queries,
    getQueries,
    STATUS_QUERY: QUERY_MAPPINGS.STATUS_QUERY,
    LATEST_BUILD_QUERY: QUERY_MAPPINGS.LATEST_BUILD_QUERY,
    DELETE_STEPS_QUERY: QUERY_MAPPINGS.DELETE_STEPS_QUERY
};