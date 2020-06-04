'use strict';

const BuildFactoryQueries = {
    // getBuildStatuses()
    statusesQuery: `SELECT "id", "jobId", "status", "startTime", "endTime"
        FROM (SELECT "id", "jobId", "status", "startTime", "endTime",
        RANK() OVER ( PARTITION BY "jobId" ORDER BY "id" DESC ) AS rank
        FROM builds WHERE "jobId" in (:jobIds)) as R
        WHERE rank > :offset AND rank <= :maxRank
        ORDER BY "jobId", "id" ASC`,

    statusesQueryMySql: `SELECT id, jobId, status, startTime, endTime FROM (
	    SELECT a.id, a.jobId, a.status, a.startTime,  a.endTime, count(b.id)+1 AS rank
		FROM  builds a LEFT JOIN (SELECT id, jobId FROM builds WHERE jobId IN (:jobIds)) b
                ON a.id>b.id AND a.jobId=b.jobId
            WHERE a.jobId IN (:jobIds)
            GROUP BY a.jobId, a.id) AS R
        WHERE rank > :offset AND rank <= :maxRank
            ORDER BY jobId, id ASC`,

    // getLatestBuilds()
    latestBuildQuery: `SELECT * FROM (
        SELECT *, RANK() OVER ( PARTITION BY "jobId" ORDER BY "id" DESC ) AS rank
        FROM builds WHERE "eventId" in
        (SELECT "id" FROM events WHERE "groupEventId" = (:groupEventId))) AS events
        WHERE rank = 1
        ORDER BY "jobId", "id" DESC`,

    latestBuildQueryMySql: `SELECT id, environment, eventId, jobId, parentBuildId, number, container, cause, sha,
                commit, createTime, startTime, endTime, parameters, meta, status, statusMessage,
                buildClusterName, stats, parentBuilds, templateId FROM (
        SELECT a.id, a.environment, a.eventId, a.jobId, a.parentBuildId, a.number, a.container, a.cause, a.sha,
                a.commit, a.createTime, a.startTime, a.endTime, a.parameters, a.meta, a.status, a.statusMessage,
                a.buildClusterName, a.stats, a.parentBuilds, a.templateId, count(b.id)+1 AS rank
        FROM builds a LEFT JOIN (SELECT id, jobId FROM builds WHERE eventId IN
                                    (SELECT id FROM events WHERE groupEventId = :groupEventId)) b
                ON a.id>b.id AND a.jobId=b.jobId
            WHERE a.eventId IN (SELECT id FROM events WHERE groupEventId = :groupEventId)
            GROUP BY a.jobId, a.id) as R
        WHERE rank=1
        ORDER BY jobId, id DESC`
};

module.exports = { BuildFactoryQueries };
