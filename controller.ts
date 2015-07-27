/// <reference path="type_declarations/index.d.ts" />
import url = require('url');
import _ = require('lodash');
import Router = require('regex-router');
import {logger} from 'loge';

import registry = require('./registry');
import database = require('./database');

var package_json = require('./package.json');

var R = new Router();

/** GET /packages
  q=some+query
  size=100
  downloadFactor=0.1
Show all packages matching a basic full text query
*/
R.get(/^\/packages\?/, (req, res: any) => {
  var urlObj = url.parse(req.url, true);

  var q = urlObj.query.q;
  var size = parseInt(urlObj.query.size || '100', 10) || 100;
  var downloadsFactor = parseFloat(urlObj.query.downloadsFactor || '0.1') || 0.1;

  database.client.search({
    index: 'npm',
    type: 'packages',
    body: {
      // leave the body JSON-ish for easier debugging
      "query": {
        "function_score": {
          "functions": [{
            "field_value_factor": {
              "field": "averageDownloadsPerDay",
              "missing": 1,
              "factor": downloadsFactor,
              "modifier": "ln1p"
            }
          }],
          "filter": {
            "exists": {
              // exclude unpublished (=unversioned) packages
              "field": "modified"
            }
          },
          "query": {
            "match": {
              "_all": q
            }
          }
        }
      },
      // "sort": [sort], // defaults to _score
      "size": size
    },
  }, (err, result) => {
    if (err) return res.error(err);
    /** Full result looks like:
    {
      "took": 89,
      "timed_out": false,
      "_shards": {
        "total": 5,
        "successful": 5,
        "failed": 0
      },
      "hits": {
        "total": 452,
        "max_score": 10.770133,
        "hits": [
          {
            "_index": "npm",
            "_type": "packages",
            "_id": "immutable",
            "_score": 10.770133,
            "_source": {
              "name": "immutable",
              "modified": "2015-06-17T17:16:22.139Z",
              "author": {
                "name": "Lee Byron",
                "url": "https://github.com/leebyron"
              },
              ...
            },
            ...
          },
          ...
        ]
      }
    }
    */
    var hits = result.hits ? result.hits.hits : [];
    var packages = hits.map((hit) => {
      return _.extend(hit._source, {_score: hit._score});
    });
    res.setHeader('Content-Range', `packages 0-${packages.length}/${result.hits ? result.hits.total : 'NA'}`);
    res.json(packages);
  });
});

/** GET /packages/:package_name
Show single package details
*/
R.get(/^\/packages\/(.+)$/, (req, res: any, m) => {
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
