/*
 * Copyright (c) 2013 Joyent Inc. All rights reserved.
 *
 * The 'smrt' CLI class.
 */

var p = console.log;
var util = require('util'),
    format = util.format;

var assert = require('assert-plus');
var async = require('async');
var bunyan = require('bunyan');
var cmdln = require('cmdln'),
    Cmdln = cmdln.Cmdln;

var common = require('./common');
var SMRT = require('./smrt');



//---- globals

var pkg = require('../package.json');
var name = 'smrt';
var log = bunyan.createLogger({
    name: name,
    serializers: bunyan.stdSerializers,
    stream: process.stderr,
    level: 'warn'
});


//---- CLI class

function CLI() {
    Cmdln.call(this, {
        name: pkg.name,
        desc: pkg.description,
        options: [
            {names: ['help', 'h'], type: 'bool', help: 'Print help and exit.'},
            {name: 'version', type: 'bool', help: 'Print version and exit.'},
            {names: ['verbose', 'v'], type: 'bool', help: 'Verbose/debug output.'}
        ],
        helpOpts: {
            includeEnv: true,
            minHelpCol: 23 /* line up with option help */
        }
    });
}
util.inherits(CLI, Cmdln);

CLI.prototype.init = function (opts, args, callback) {
    var self = this;

    if (opts.version) {
        p(this.name, pkg.version);
        callback(false);
        return;
    }
    this.opts = opts;
    if (opts.verbose) {
        log.level('trace');
        log.src = true;
    }

    this.__defineGetter__('smrt', function () {
        if (self._smrt === undefined) {
            self._smrt = new SMRT();
        }
        return self._smrt;
    });

    // Cmdln class handles `opts.help`.
    Cmdln.prototype.init.apply(this, arguments);
};



CLI.prototype.do_paris = function (subcmd, opts, args, callback) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], callback);
        return;
    } else if (args.length > 1) {
        return callback(new Error('too many args: ' + args));
    }

    var profiles = this.smrt.profiles;

    if (opts.list) {
        if (profiles.length === 0) {
            p('No current profiles. Use "smrt paris" to make one.');
        } else {
            var profs = common.deepObjCopy(profiles);
            var currProfileName = this.smrt.currProfileName;
            for (var i = 0; i < profs.length; i++) {
                profs[i].curr = (profs[i].name === currProfileName ? '*' : ' ');
            }
            common.tabulate(profs, {
                columns: 'curr,name,url,account,key',
                sort: 'url,account',
                validFields: 'curr,name,url,account,key'
            });
        }
        callback();
        return;
    }

    // Delete a profile.
    if (opts['delete']) {
        this.smrt.deleteProfile(name, callback);
        return;
    }

    // Set current profile.
    if (args.length) {
        var name = args[0];
        p('Set current profile to "%s".', name);
        this.smrt.setCurrProfile(name, callback);
        return;
    }

    // Edit a profile.
    //XXX

    // Create a new profile.
    XXX
};
CLI.prototype.do_paris.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    },
    {
        names: ['list', 'l'],
        type: 'bool',
        help: 'List current profiles.'
    },
    {
        names: ['delete', 'd'],
        type: 'string',
        helpArg: '<name>',
        help: 'Delete the given profile.'
    }
];
CLI.prototype.do_paris.help = (
    'Select and setup for an SDC cloudapi.\n'
    + '\n'
    + 'Usage:\n'
    + '     {{name}} paris         # list current profiles, or create first\n'
    + '     {{name}} paris -l      # list profiles\n'
    + '     {{name}} paris <name>  # set current profile\n'
    + '\n'
    + '{{options}}'
    + '\n'
    + 'This is handled via so called "smrt profiles". A smrt profile is\n'
    + 'the data required to specify an SDC cloudapi endpoint and the auth\n'
    + 'to use it.\n'
);


CLI.prototype.do_helen = function (subcmd, opts, args, callback) {
    var self = this;
    if (opts.help) {
        this.do_help('help', {}, [subcmd], callback);
        return;
    }
    var smrt = self.smrt;

    var machines = [];
    for (var i = 0; i < opts.num; i++) {
        machines.push({i: i});
    }

    function createMachineAndWait(machine, cb) {
        var img, pkg;
        async.series([
            function chooseImage(next) {
                smrt.randomImage(function (err, img_) {
                    img = img_;
                    next(err);
                });
            },
            function choosePackage(next) {
                smrt.randomPackage(img, function (err, pkg_) {
                    pkg = pkg_;
                    next(err);
                });
            },
            function createMachine(next) {
                var machOpts = {
                    name: smrt.randomNameSync('greeks'),
                    // TODO: incr from existing with same name, or from a local
                    //       cache for used names.
                    version: '1.0.0',
                    // TODO: description is details about the name
                    tags: {homeric: true},
                    image: img,
                    'package': pkg
                };
                p('XXX', machOpts)
                smrt.createMachine(machOpts, function (err, res) {
                    if (err) {
                        p('Creating machine "%s" (%s %s, %s) failed: %s',
                            machOpts.name, img.name, img.version, pkg.name,
                            err);
                        machine.err = err;
                        return next();
                    }
                    p('Creating machine "%s" (%s %s, %s): id %s',
                        machOpts.name, img.name, img.version, pkg.name, res.id);
                    machine.res = res;
                    next();
                });
            },
            function waitForRunning(next) {
                smrt.waitForMachineState('running', function (err, res) {
                    if (err) {
                        machine.err = err;
                        return next();
                    }
                    machine.res = res;
                    next();
                });
            }
        ], cb);
    }

    async.each(
        machines,
        createMachineAndWait,
        function done(err) {
            p('XXX', JSON.stringify(machines, null, 4));
            callback(err);
        });
};
CLI.prototype.do_helen.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    },
    {
        names: ['num', 'n'],
        type: 'positiveInteger',
        helpArg: '<num>',
        help: 'A number of instances (aka VMs, aka machines) to create.',
        'default': 3
    }
];
CLI.prototype.do_helen.help = (
    'Launch a 1000 ships... or at least a few instances (VMs).\n'
    + '\n'
    + 'Usage:\n'
    + '     {{name}} helen [-n <num-insts>] [<image-name>[:<package-name>]]\n'
    + '\n'
    + '{{options}}'
);



//---- exports

module.exports = CLI;
