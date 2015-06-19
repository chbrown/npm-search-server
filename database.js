/// <reference path="type_declarations/index.d.ts" />
var _ = require('lodash');
var async = require('async');
var registry = require('./registry');
var request = require('request');
var logger = require('loge');
// as of 2015-05-30, DefinitelyTyped doesn't have elasticsearch types
var elasticsearch = require('elasticsearch');
exports.client = new elasticsearch.Client({
    host: 'elasticsearch:9200',
    log: 'error',
});
function insertPackages(packages, callback) {
    logger.debug('inserting batch of %d packages, from %s to %s', packages.length, packages[0].name, packages[packages.length - 1].name);
    var body = [];
    packages.forEach(function (package) {
        body.push({ index: { _id: package.name } }, package);
    });
    exports.client.bulk({
        index: 'npm',
        type: 'packages',
        body: body
    }, function (error, result) {
        if (error) {
            logger.error('failed to insert batch: %s', error.message);
            return callback(error);
        }
        logger.debug('inserting batch took %d ms', result.took);
        if (result.errors) {
            logger.warn('batch insert encountered non-fatal errors: %j', result.errors);
        }
        callback();
    });
}
/**
Pull the latest / a recent average downloads dump from the npm-downloads-data
repository, and merge it with the given packages.

A download dump file is about 2.7 MB.
*/
function mergeAverageDownloadsPerDay(packages, callback) {
    var url = 'https://cdn.rawgit.com/chbrown/npm-downloads-data/gh-pages/2015/04/averages.json';
    logger.debug('fetching url: "%s"', url);
    request.get({ url: url, json: true }, function (error, response, body) {
        if (error)
            return callback(error);
        logger.debug('fetched download counts for %d packages', Object.keys(body).length);
        packages.forEach(function (package) {
            package.averageDownloadsPerDay = body[package.name] || 0;
        });
        callback(null, packages);
    });
}
/**
Update the ElasticSearch database from the NPM registry.
*/
function update(updates_only, callback) {
    registry.fetchPackages(updates_only, function (error, packages) {
        if (error)
            return callback(error);
        mergeAverageDownloadsPerDay(packages, function (error, packages) {
            if (error)
                return callback(error);
            logger.debug('updating with %d packages (%s)', packages.length, updates_only ? 'updates only' : 'all packages');
            var batches = _.chunk(packages, 500);
            async.eachSeries(batches, insertPackages, callback);
        });
    });
}
exports.update = update;
