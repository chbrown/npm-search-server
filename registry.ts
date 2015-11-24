import * as _ from 'lodash';
import * as fs from 'fs';
import * as path from 'path';
import * as request from 'request';
import {logger} from 'loge';

export interface User {
  name?: string;
  email?: string;
  url?: string;
}

// the only required field is name
export interface Package {
  name: string;
  // convert `time.modified` to `modified`, if present. About 210 packages don't have it.
  modified?: string;
  // `author` is either a string or a User object. If it is a User object,
  // name is always present. email and url are optional.
  author?: User;
  // bugs is usually a URL, but sometimes an email. Use bugs.url || bugs.email || bugs
  bugs?: string;
  // contributors is sometimes an empty array, sometimes a single user, sometimes just a string
  contributors?: User[];
  // `description` is sometimes null
  description?: string;
  // if homepage is an array, use the first element. it's usually a string though.
  homepage?: string;
  // if keywords is a string, it should be split on ',\s*', or on ' ' if it contains no commas.
  // it's usually an array of strings, though.
  keywords?: string[];
  // ignore `dist-tags` for the most part, convert to `latest` if possible
  latest?: string;
  // license.type || license.name || license.license should be used when
  //   license is an object but not a string. if it's an array, use license[0].type|name|license
  license?: string;
  // maintainers is actually a list of Users already, always only name and email
  maintainers?: User[];
  // ignore `readmeFilename`
  // repository is rarely just a string
  // repository.web is rare but sometimes provides the web interface matching a git repo
  // repository.type is something like "git"
  // repository.url is the url to go along with something like git; sometimes it uses the git:// protocol, sometimes http:// or https://
  // repository.homepage : there are like 5 instances of this, total.
  repository?: string;
  // ignore `users`; I'm not sure what it's for.
  // ignore `versions`, which maps from a single key (a semver version string, usually), to the string 'latest'
  // it is not required

  // other fields not from the registry
  averageDownloadsPerDay?: number;
}

/**
Returns true for null, undefined, '', [], and {}; otherwise returns false.
*/
function isEmpty(obj: any): boolean {
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
function pick(obj: any, keys: string[]): string {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj == 'string') {
    return obj;
  }
  for (var i = 0, key: string; (key = keys[i]); i++) {
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
function normalizeUser(obj: any): User {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // parse user object from string
  if (typeof obj == 'string') {
    var match = obj.match(/([^<]+)(?: <([^>]+)>(?: \(([^)]+)\)))?/);
    var user_from_string: User = {name: match[1]};
    if (match[2]) {
      user_from_string.email = match[2];
    }
    if (match[3]) {
      user_from_string.url = match[3];
    }
    return user_from_string;
  }

  // clean up the object
  var user_from_object: User = {name: obj.name};
  if (obj.email) {
    user_from_object.email = obj.email;
  }
  if (obj.url) {
    user_from_object.url = obj.url;
  }
  return user_from_object;
}

// elasticsearch doesn't like how flexible CouchDB can be (and how messy the actual NPM database is)
function normalizePackage(obj: any): Package {
  var pkg: Package = {name: obj.name};
  pkg.modified = (obj.time || {}).modified;
  pkg.author = normalizeUser(obj.author);
  pkg.bugs = pick(obj.bugs, ['url', 'email', 'name', 'web', 'mail']);
  // coerce to array
  pkg.contributors = [].concat(obj.contributors || []).map(normalizeUser);
  pkg.description = obj.description;
  // coalesce to array and pull off first item
  pkg.homepage = [].concat(obj.homepage)[0];
  if (typeof obj.keywords == 'string') {
    obj.keywords = obj.keywords.split(/,\s*/);
    if (obj.keywords.length == 1) {
      obj.keywords = obj.keywords[0].split(/\s+/);
    }
  }
  pkg.keywords = obj.keywords;
  pkg.latest = (obj['dist-tags'] || {}).latest;
  // coalesce to array and pull off first item
  // we can't use a || obj.license at the end of the chain below since
  // `'' || 'y'` returns 'y', which means {type: ""} would result in {type: ""}.
  if (typeof obj.license == 'string') {
    obj.license = {type: obj.license};
  }
  pkg.license = pick([].concat(obj.license)[0], ['type', 'name', 'license', 'sourceType', 'url']);
  pkg.maintainers = (obj.maintainers || []).map(normalizeUser);
  // coalesce to array and pull off first item
  pkg.repository = pick([].concat(obj.repository)[0], ['homepage', 'url', 'web', 'url']);
  // clean up
  for (var key in pkg) {
    if (isEmpty(pkg[key])) {
      delete pkg[key];
    }
  }
  return pkg;
}

const REGISTRY_CACHE_FILEPATH = path.join(__dirname, 'npm-registry.json');

/**
Get the latest updates from the definitive CouchDB source / the CDN update blobs.

In the cache file, `_updated` looks something like:

    "_updated": 1416495599950,

Where the value is milliseconds since the epoch.

See npm/lib/cache/update-index.js for usage of `/since` path and `stale` and
`startkey` parameters.
*/
export function fetchPackages(updates_only: boolean, callback: (error: Error, packages?: Package[]) => void) {
  fs.readFile(REGISTRY_CACHE_FILEPATH, {encoding: 'utf8'}, (err, data) => {
    // all we need from the cache is the latest `_updated` value
    if (err || data === '') {
      data = '{"_updated":0}';
    }
    var registry = JSON.parse(data);
    var _updated: number = registry._updated;

    // updating the locally-cached registry file happens the same way regardless
    // of the updates_only flag
    var url = `https://registry.npmjs.org/-/all/since?stale=update_after&startkey=${_updated}`;
    logger.debug('fetching url: "%s"', url);
    request.get({url: url, json: true}, (error, response, body) => {
      if (error) return callback(error);

      logger.debug('fetched %d updates', Object.keys(body).length - 1);

      // update and save the cached registry, but don't wait for it
      _.assign(registry, body);
      fs.writeFile(REGISTRY_CACHE_FILEPATH, JSON.stringify(registry), {encoding: 'utf8'}, (error) => {
        if (error) {
          return logger.error('failed to save registry: %s', error.message);
        }
        logger.debug('saved updated registry file');
      });

      var names = updates_only ? Object.keys(body) : Object.keys(registry);
      var packages = names.filter(name => name !== '_updated').map(name => normalizePackage(registry[name]));
      callback(null, packages);
    });
  });
}
