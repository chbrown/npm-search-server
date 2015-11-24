import * as _ from 'lodash';
import * as async from 'async';
import * as request from 'request';
import {logger} from 'loge';

import registry = require('./registry');

// as of 2015-05-30, DefinitelyTyped doesn't have elasticsearch types
var elasticsearch = require('elasticsearch');
export var client = new elasticsearch.Client({
  host: 'elasticsearch:9200',
  log: 'error', // error | debug | trace
});

function insertPackages(packages: registry.Package[], callback: (error?: Error) => void) {
  logger.debug('inserting batch of %d packages, from %s to %s', packages.length,
    packages[0].name, packages[packages.length - 1].name);

  var body = [];
  packages.forEach(pkg => {
    body.push({index: {_id: pkg.name}}, pkg);
  });

  client.bulk({
    index: 'npm',
    type: 'packages',
    body: body
  }, (error: Error, result) => {
    if (error) {
      logger.error('failed to insert batch: %s', error.message);
      return callback(error);
    }
    logger.debug('inserting batch took %d ms', result.took);
    if (result.errors) {
      logger.warning('batch insert encountered non-fatal errors: %j', result.errors);
    }
    callback();
  });
}

/**
Pull the latest / a recent average downloads dump from the npm-downloads-data
repository, and merge it with the given packages.

A download dump file is about 2.7 MB.
*/
function mergeAverageDownloadsPerDay(packages: registry.Package[],
                                     callback: (error: Error, packages?: registry.Package[]) => void) {
  var url = 'https://cdn.rawgit.com/chbrown/npm-downloads-data/gh-pages/2015/04/averages.json';
  logger.debug('fetching url: "%s"', url);
  request.get({url: url, json: true}, (error, response, body: {[index: string]: number}) => {
    if (error) return callback(error);

    logger.debug('fetched download counts for %d packages', Object.keys(body).length);

    packages.forEach(pkg => {
      pkg.averageDownloadsPerDay = body[pkg.name] || 0;
    });

    callback(null, packages);
  });
}

/**
Update the ElasticSearch database from the NPM registry.
*/
export function update(updates_only: boolean, callback: (error?: Error) => void) {
  registry.fetchPackages(updates_only, (error, packages) => {
    if (error) return callback(error);
    mergeAverageDownloadsPerDay(packages, (error, packages) => {
      if (error) return callback(error);

      logger.debug('updating with %d packages (%s)', packages.length, updates_only ? 'updates only' : 'all packages');
      var batches = _.chunk(packages, 500);
      async.eachSeries(batches, insertPackages, callback);
    });
  });
}
