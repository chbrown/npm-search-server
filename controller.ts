/// <reference path="type_declarations/index.d.ts" />
import url = require('url');
import _ = require('lodash');
import Router = require('regex-router');

import registry = require('./registry');
import database = require('./database');

var package_json = require('./package.json');
var logger = require('loge');

var R = new Router();

/** GET /api/packages
  q=some+query
  size=100
  sort=-_score
Show all packages matching a basic full text query
*/
R.get(/^\/api\/packages\?/, (req, res: any) => {
  var urlObj = url.parse(req.url, true);

  var size = parseInt(urlObj.query.size || '100', 10) || 100;
  var sort = {};
  var [full_match, sort_direction, sort_key] = (urlObj.query.sort || '-_score').match(/^([-+])?(.+)$/);
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
  }, (err, result) => {
    if (err) return res.error(err);

    var hits = result.hits ? result.hits.hits : [];
    var packages = hits.map((hit) => {
      return _.extend(hit._source, {_score: hit._score});
    });

    res.json(packages);
  });
});

/** GET /api/packages/:package_name
Show single package details
*/
R.get(/^\/api\/packages\/(.+)$/, (req, res: any, m) => {
  var package_name = m[1];
  database.client.get({
    index: 'npm',
    type: 'packages',
    id: package_name,
  }, (err, result) => {
    if (err) return res.error(err, req.headers);

    res.json(result._source);
  });
});

/** GET /info
Show npm-search-server package metadata
*/
R.get(/^\/info$/, (req, res: any, m) => {
  var info = {
    name: package_json.name,
    version: package_json.version,
    description: package_json.description,
    homepage: package_json.homepage,
    author: package_json.author,
    license: package_json.license,
  };
  res.json(info);
});

export = R;
