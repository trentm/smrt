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
            var currProfile = this.smrt.currProfile;
            for (var i = 0; i < profs.length; i++) {
                profs[i].curr = (profs[i].name === currProfile ? '*' : ' ');
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
    + '     {{name}} paris [<options>]\n'
    + '\n'
    + '{{options}}'
    + '\n'
    + 'This is handled via so called "smrt profiles". A smrt profile is\n'
    + 'the data required to specify an SDC cloudapi endpoint and the auth\n'
    + 'to use it.\n'
);



//---- exports

module.exports = CLI;
