/// <reference path="type_declarations/index.d.ts" />
var yargs = require('yargs');
var http = require('http-enhanced');
var logger = require('loge');
var controller = require('./controller');
var database = require('./database');
var server = http.createServer(function (req, res) {
    logger.debug('%s %s', req.method, req.url);
    // enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    controller.route(req, res);
});
server.on('listening', function () {
    var address = server.address();
    logger.info("server listening on http://" + address.address + ":" + address.port);
});
function main() {
    var argvparser = yargs
        .usage('Usage: npm-search-server -p 80')
        .describe({
        force: 'force update of all packages',
        hostname: 'hostname to listen on',
        port: 'port to listen on',
        help: 'print this help message',
        verbose: 'print extra output',
        version: 'print version',
    })
        .alias({
        f: 'force',
        h: 'help',
        p: 'port',
        v: 'verbose',
    })
        .default({
        hostname: process.env.HOSTNAME || '127.0.0.1',
        port: parseInt(process.env.PORT, 10) || 80,
        verbose: !!process.env.VERBOSE,
    })
        .boolean(['force', 'help', 'verbose', 'version']);
    var argv = argvparser.argv;
    logger.level = argv.verbose ? 'debug' : 'info';
    if (argv.help) {
        yargs.showHelp();
    }
    else if (argv.version) {
        console.log(require('./package').version);
    }
    else {
        // update the database when starting
        var updates_only = !argv.force;
        database.update(updates_only, function (error) {
            if (error) {
                return logger.error('initialization database update failed: %s', error.message);
            }
            logger.debug('initialization database update completed successfully');
        });
        // and once a day thereafter
        setInterval(function () {
            database.update(true, function (error) {
                if (error) {
                    return logger.error('interval database update failed: %s', error.message);
                }
                logger.debug('interval database update completed successfully');
            });
        }, 24 * 60 * 60 * 1000);
        server.listen(argv.port, argv.hostname);
    }
}
exports.main = main;
