/// <reference path="type_declarations/index.d.ts" />
var url = require('url');
var _ = require('lodash');
var Router = require('regex-router');
var database = require('./database');
var logger = require('loge');
var R = new Router();
/** GET /api/packages
  q=some+query
  size=100
  sort=-_score
Show all packages matching a basic full text query
*/
R.get(/^\/api\/packages\?/, function (req, res) {
    var urlObj = url.parse(req.url, true);
    var size = parseInt(urlObj.query.size || '100', 10) || 100;
    var sort = {};
    var _a = (urlObj.query.sort || '-_score').match(/^([-+])?(.+)$/), full_match = _a[0], sort_direction = _a[1], sort_key = _a[2];
    sort[sort_key] = (sort_direction === '-') ? 'desc' : 'asc';
    database.client.search({
        index: 'npm',
        type: 'packages',
        body: {
            query: {
                filtered: {
                    filter: {
                        exists: {
                            // exclude unpublished (=unversioned) packages
                            field: 'modified'
                        },
                    },
                    query: {
                        match: {
                            _all: urlObj.query.q,
                        },
                    },
                },
            },
            size: size,
            sort: [
                sort
            ],
        },
    }, function (err, result) {
        if (err)
            return res.error(err);
        var hits = result.hits ? result.hits.hits : [];
        var packages = hits.map(function (hit) {
            return _.extend(hit._source, { _score: hit._score });
        });
        res.json(packages);
    });
});
/** GET /api/packages/:package_name
Show single package details
*/
R.get(/^\/api\/packages\/(.+)$/, function (req, res, m) {
    var package_name = m[1];
    database.client.get({
        index: 'npm',
        type: 'packages',
        id: package_name,
    }, function (err, result) {
        if (err)
            return res.error(err, req.headers);
        res.json(result._source);
    });
});
module.exports = R;
