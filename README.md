# npm-search-server

How does this compare to [npm-www](https://github.com/npm/npm-www), and [newww](https://github.com/npm/newww), which is live at <del>[preview.npmjs.com](https://preview.npmjs.com/)</del>? **New!** Turns out the new site was [deployed](https://www.npmjs.com/) on 2014-12-09, the same day I pushed this repository's code up to GitHub! Still, the new site doesn't let you sort or anything, so it's not much more useful, but it does look nicer than the old site.

Also, [npm2es](https://github.com/solids/npm2es) might be useful? Has CouchDB -> Elasticsearch syncing features.

I'm not sure what compelling reason there is to use [npm-registry-client](https://github.com/npm/npm-registry-client) -- it looks like it's just a wrapper around request with named functions for a few of the registry's endpoints.

The registry API desperately lacks documentation other than the npm source code, but the api API has [better documentation](https://github.com/npm/download-counts).


## Development

Start the server like:

    PORT=8700 node_restarter 'node server.js'

A plain `npm start` should work too.


## Environment

The app expects an Elasticsearch server reachable at `elasticsearch:9200`.
It also expects a GitHub API token in an environment variable called `GITHUB_TOKEN`.


## packages from `https://registry.npmjs.org/-/all` have the following interface:

    interface Package {
      name: string
      // name is the only required field; all the others may be omitted
      time?: {modified: Date}
      author?: {name: string, email: string, url: string}
             | {name: string, email: string}
             | {name: string}
      ...
    }


## Docker config

    docker run -d --name elasticsearch -p 127.0.0.1:9200:9200 -p 127.0.0.1:9300:9300 dockerfile/elasticsearch
    docker run -d --name app -p 80:80 --link elasticsearch:elasticsearch chbrown/npm-ui

If you want to make sure you're running the latest `npm-ui` image:

    docker pull chbrown/npm-ui
    docker rm -f app
    docker run -d --name app -p 80:80 --link elasticsearch:elasticsearch chbrown/npm-ui


## [machine](https://github.com/docker/machine) initialization

    export DIGITALOCEAN_ACCESS_TOKEN=n0t4ctua11ymydigital0ceant0k3n
    machine create -d digitalocean --digitalocean-size=512mb npm-ui
    $(machine env npm-ui)

[Adding swap space](https://www.digitalocean.com/community/tutorials/how-to-add-swap-on-ubuntu-14-04):

    swapon -s    # check current config
    #dd if=/dev/zero of=/swapfile bs=1G count=4 # slow! fallocate is better.
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile


## License

Copyright 2014-2015 Christopher Brown. [MIT Licensed](http://opensource.org/licenses/MIT).
