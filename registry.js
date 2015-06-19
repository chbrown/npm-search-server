/// <reference path="type_declarations/index.d.ts" />
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var request = require('request');
var logger = require('loge');
/**
Returns true for null, undefined, '', [], and {}; otherwise returns false.
*/
function isEmpty(obj) {
    // null/undefined
    if (obj === null || obj === undefined) {
        return true;
    }
    // empty strings and arrays
    if (obj.length == 0) {
        return true;
    }
    // empty objects
    if (typeof obj == 'object' && Object.keys(obj).length === 0) {
        return true;
    }
    return false;
}
/**
Resolve an object / string to a string by designating a list of preferred keys.
*/
function pick(obj, keys) {
    if (obj === null || obj === undefined) {
        return obj;
    }
    if (typeof obj == 'string') {
        return obj;
    }
    for (var i = 0, key; (key = keys[i]); i++) {
        var value = obj[key];
        if (!isEmpty(value)) {
            return value;
        }
    }
    return undefined;
}
/**
obj can be null, a string, or an object with name/email/url keys

At sign replacements:
  (a) [at] [AT]
*/
function normalizeUser(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }
    // parse user object from string
    if (typeof obj == 'string') {
        var match = obj.match(/([^<]+)(?: <([^>]+)>(?: \(([^)]+)\)))?/);
        var user_from_string = { name: match[1] };
        if (match[2]) {
            user_from_string.email = match[2];
        }
        if (match[3]) {
            user_from_string.url = match[3];
        }
        return user_from_string;
    }
    // clean up the object
    var user_from_object = { name: obj.name };
    if (obj.email) {
        user_from_object.email = obj.email;
    }
    if (obj.url) {
        user_from_object.url = obj.url;
    }
    return user_from_object;
}
// elasticsearch doesn't like how flexible CouchDB can be (and how messy the actual NPM database is)
function normalizePackage(obj) {
    var package = { name: obj.name };
    package.modified = (obj.time || {}).modified;
    package.author = normalizeUser(obj.author);
    package.bugs = pick(obj.bugs, ['url', 'email', 'name', 'web', 'mail']);
    // coerce to array
    package.contributors = [].concat(obj.contributors || []).map(normalizeUser);
    package.description = obj.description;
    // coalesce to array and pull off first item
    package.homepage = [].concat(obj.homepage)[0];
    if (typeof obj.keywords == 'string') {
        obj.keywords = obj.keywords.split(/,\s*/);
        if (obj.keywords.length == 1) {
            obj.keywords = obj.keywords[0].split(/\s+/);
        }
    }
    package.keywords = obj.keywords;
    package.latest = (obj['dist-tags'] || {}).latest;
    // coalesce to array and pull off first item
    // we can't use a || obj.license at the end of the chain below since
    // `'' || 'y'` returns 'y', which means {type: ""} would result in {type: ""}.
    if (typeof obj.license == 'string') {
        obj.license = { type: obj.license };
    }
    package.license = pick([].concat(obj.license)[0], ['type', 'name', 'license', 'sourceType', 'url']);
    package.maintainers = (obj.maintainers || []).map(normalizeUser);
    // coalesce to array and pull off first item
    package.repository = pick([].concat(obj.repository)[0], ['homepage', 'url', 'web', 'url']);
    // clean up
    for (var key in package) {
        if (isEmpty(package[key])) {
            delete package[key];
        }
    }
    return package;
}
var REGISTRY_CACHE_FILEPATH = path.join(__dirname, 'npm-registry.json');
/**
Get the latest updates from the definitive CouchDB source / the CDN update blobs.

In the cache file, `_updated` looks something like:

    "_updated": 1416495599950,

Where the value is milliseconds since the epoch.

See npm/lib/cache/update-index.js for usage of `/since` path and `stale` and
`startkey` parameters.
*/
function fetchPackages(updates_only, callback) {
    fs.readFile(REGISTRY_CACHE_FILEPATH, { encoding: 'utf8' }, function (err, data) {
        // all we need from the cache is the latest `_updated` value
        if (err || data === '') {
            data = '{"_updated":0}';
        }
        var registry = JSON.parse(data);
        var _updated = registry._updated;
        // updating the locally-cached registry file happens the same way regardless
        // of the updates_only flag
        var url = "https://registry.npmjs.org/-/all/since?stale=update_after&startkey=" + _updated;
        logger.debug('fetching url: "%s"', url);
        request.get({ url: url, json: true }, function (error, response, body) {
            if (error)
                return callback(error);
            logger.debug('fetched %d updates', Object.keys(body).length - 1);
            // update and save the cached registry, but don't wait for it
            _.extend(registry, body);
            fs.writeFile(REGISTRY_CACHE_FILEPATH, JSON.stringify(registry), { encoding: 'utf8' }, function (error) {
                if (error) {
                    return logger.error('failed to save registry: %s', error.message);
                }
                logger.debug('saved updated registry file');
            });
            var names = updates_only ? Object.keys(body) : Object.keys(registry);
            var packages = names.filter(function (name) { return name !== '_updated'; }).map(function (name) { return normalizePackage(registry[name]); });
            callback(null, packages);
        });
    });
}
exports.fetchPackages = fetchPackages;
