'use strict';

const BuildFactoryQueries = {
    statusesQuery: `SELECT "id", "jobId", "status", "startTime", "endTime"
        FROM (SELECT "id", "jobId", "status", "startTime", "endTime",
        RANK() OVER ( PARTITION BY "jobId" ORDER BY "id" DESC ) AS rank
        FROM builds WHERE "jobId" in (:jobIds)) as R
        WHERE rank > :offset AND rank <= :maxRank
        ORDER BY "jobId", "id" DESC`,

    statusesQueryMySql: `SELECT id, jobId, status, startTime, endTime
        FROM (SELECT id, jobId, status, startTime, endTime,
        RANK() OVER ( PARTITION BY jobId ORDER BY id DESC ) AS \`rank\`
        FROM builds WHERE jobId in (:jobIds)) as R
        WHERE \`rank\` > :offset AND \`rank\` <= :maxRank
        ORDER BY jobId, id DESC`,

    latestBuildQuery: `SELECT * FROM (
        SELECT *, RANK() OVER ( PARTITION BY "jobId" ORDER BY "id" DESC ) AS rank
        FROM builds WHERE "eventId" in
        (SELECT "id" FROM events WHERE "groupEventId" = (:groupEventId))) AS events
        WHERE rank = 1
        ORDER BY "jobId", "id" DESC`,

    latestBuildQueryMySql: `SELECT * FROM (
        SELECT *, RANK() OVER ( PARTITION BY jobId ORDER BY id DESC ) AS \`rank\`
        FROM builds WHERE eventId in
        (SELECT id FROM events WHERE groupEventId = (:groupEventId))) AS \`events\`
        WHERE \`rank\` = 1
        ORDER BY jobId, id DESC`
};

module.exports = { BuildFactoryQueries };
