'use strict';

const BuildFactoryQueries = {
    statusesQuery:
        `SELECT r."id", r."jobId", j."name" as "jobName", r."status", r."startTime", r."endTime"
        FROM (SELECT "id", "jobId", "status", "startTime", "endTime",
        RANK() OVER ( PARTITION BY "jobId" ORDER BY "id" DESC ) AS rank
        FROM builds WHERE "jobId" in (:jobIds)) r
        INNER JOIN jobs as j ON j."id" = r."jobId"
        WHERE rank > :offset AND rank <= :maxRank
        ORDER BY r."jobId", r."id" DESC`,

    statusesQueryMySql:
        `SELECT r.id, r.jobId, j.name as \`jobName\`, r.status, r.startTime, r.endTime
        FROM (SELECT id, jobId, status, startTime, endTime,
        RANK() OVER ( PARTITION BY jobId ORDER BY id DESC ) AS \`rank\`
        FROM builds WHERE jobId in (:jobIds)) r
        INNER JOIN jobs as j ON j.id = r.jobId
        WHERE \`rank\` > :offset AND \`rank\` <= :maxRank
        ORDER BY r.jobId, r.id DESC`
};

module.exports = { BuildFactoryQueries };
