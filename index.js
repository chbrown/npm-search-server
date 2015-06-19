/// <reference path="type_declarations/index.d.ts" />
var yargs = require('yargs');
var http = require('http-enhanced');
var logger = require('loge');
var controller = require('./controller');
var database = require('./database');
var InsertOption;
(function (InsertOption) {
    InsertOption[InsertOption["all"] = 0] = "all";
    InsertOption[InsertOption["updates"] = 1] = "updates";
    InsertOption[InsertOption["none"] = 2] = "none";
})(InsertOption || (InsertOption = {}));
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
        init: 'initialize by inserting "all" packages, "updates" only, or "none"',
        hostname: 'hostname to listen on',
        port: 'port to listen on',
        help: 'print this help message',
        verbose: 'print extra output',
        version: 'print version',
    })
        .alias({
        i: 'init',
        h: 'help',
        p: 'port',
        v: 'verbose',
    })
        .default({
        init: 'updates',
        hostname: process.env.HOSTNAME || '127.0.0.1',
        port: parseInt(process.env.PORT, 10) || 80,
        verbose: !!process.env.VERBOSE,
    })
        .boolean(['help', 'verbose', 'version'])
        .check(function (argv) {
        if (InsertOption[argv.init] === undefined) {
            throw new Error("Invalid \"init\" argument value: " + argv.init);
        }
        return true;
    });
    var argv = argvparser.argv;
    logger.level = argv.verbose ? 'debug' : 'info';
    if (argv.help) {
        yargs.showHelp();
    }
    else if (argv.version) {
        console.log(require('./package').version);
    }
    else {
        var initial_insert = InsertOption[argv.init];
        // update the database when starting unless initial_insert is none
        if (initial_insert !== InsertOption.none) {
            database.update(initial_insert == InsertOption.updates, function (error) {
                if (error) {
                    return logger.error('initialization database update failed: %s', error.message);
                }
                logger.debug('initialization database update completed successfully');
            });
        }
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
