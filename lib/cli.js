/*
 * Copyright (c) 2013 Joyent Inc. All rights reserved.
 *
 * The 'smrt' CLI class.
 */

var p = console.log;
var e = console.error;
var util = require('util'),
    format = util.format;
var exec = require('child_process').exec;


var assert = require('assert-plus');
var async = require('async');
var bunyan = require('bunyan');
var cmdln = require('cmdln'),
    Cmdln = cmdln.Cmdln;
var progbar = require('progbar');
var sprintf = require('extsprintf').sprintf;

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
            e('No current profiles. Use "smrt paris" to make one.');
        } else {
            var profs = common.deepObjCopy(profiles);
            var currProfileName = this.smrt.currProfileName;
            for (var i = 0; i < profs.length; i++) {
                profs[i].curr = (profs[i].name === currProfileName ? '*' : ' ');
            }
            if (opts.json) {
                p(JSON.stringify(profs, null, 4));
            } else {
                common.tabulate(profs, {
                    columns: 'curr,name,url,account,keyId',
                    sort: 'url,account',
                    validFields: 'curr,name,url,account,keyId'
                });
            }
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
        names: ['json', 'j'],
        type: 'bool',
        help: 'Output as JSON when listing current profiles.'
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

    var prof = smrt.currProfile;
    e('Launching %d machine%s using the "%s" smrt profile:\n'
        + '    SDC_URL=%s\n'
        + '    SDC_ACCOUNT=%s\n'
        + '    SDC_KEY_ID=%s\n',
        opts.num, (opts.num === 1 ? '' : 's'),
        smrt.currProfileName, prof.url, prof.account, prof.keyId);

    var machines = [];
    for (var n = 0; n < opts.num; n++) {
        machines.push({n: n});
    }
    var now = (new Date()).toISOString().replace(
        /[-:]/g, '').replace(/\.\d+/, '');
    var bar = new progbar.ProgressBar({
        filename: opts.num + ' machines',
        size: opts.num
    });

    function createMachineAndWait(machine, cb) {
        var name, img, pkg;
        async.series([
            function chooseName(next) {
                name = smrt.randomNameSync('greeks').replace(/ /g, '-');
                next();
            },
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
                name = name + '-' + now + '-' + machine.n;
                var createOpts = {
                    name: name,
                    // TODO: description is details about the name
                    'tag.homeric': true,
                    image: img,
                    'package': pkg
                };
                smrt.createMachine(createOpts, function (err, initialMach) {
                    if (err) {
                        e('Create machine "%s" (%s %s, %s) failed: %s',
                            name, img.name, img.version, pkg.name, err);
                        machine.err = err;
                        return next();
                    }
                    e('Creating machine "%s" (%s %s, %s): id %s',
                        name, img.name, img.version, pkg.name, initialMach.id);
                    machine.initial = initialMach;
                    next();
                });
            },
            function waitForProvision(next) {
                if (!machine.initial) {
                    bar.advance(1);
                    return next();
                }
                var id = machine.initial.id;
                smrt.waitForMachineProvision(id, function (err, finalMach) {
                    bar.advance(1);
                    if (err) {
                        machine.err = err;
                        return next();
                    }
                    delete machine.initial;
                    Object.keys(finalMach).forEach(function (k) {
                        machine[k] = finalMach[k];
                    });
                    next();
                });
            }
        ], cb);
    }

    async.each(
        machines,
        createMachineAndWait,
        function done(err) {
            bar.end();
            if (err) {
                return callback(err);
            }
            if (opts.json) {
                p(JSON.stringify(machines, null, 4));
                callback();
            } else {
                smrt.listImages(function (err, images) {
                    if (err) {
                        return callback(err);
                    }
                    var imageFromId = {};
                    for (var i = 0; i < images.length; i++) {
                        imageFromId[images[i].id] = images[i];
                    }
                    for (var j = 0; j < machines.length; j++) {
                        var m = machines[j];
                        m.imageNameVer = format('%s/%s',
                            imageFromId[m.image].name,
                            imageFromId[m.image].version);
                    }
                    e();
                    common.tabulate(machines, {
                        columns: 'id,name,state,imageNameVer,package,primaryIp',
                        sort: 'n',
                        validFields: 'n,id,name,type,state,image,imageNameVer,memory,disk,created,updated,primaryIp,firewall_enabled,package'
                    });
                    callback();
                });
            }
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
    },
    {
        names: ['json', 'j'],
        type: 'bool',
        help: 'Output created machines as JSON.'
    }
];
CLI.prototype.do_helen.help = (
    'Launch a 1000 ships... or at least a few instances (VMs).\n'
    + '\n'
    + 'Usage:\n'
    + '     {{name}} helen [-n <num>] [<image-name>[:<package-name>]]\n'
    + '\n'
    + '{{options}}'
);


CLI.prototype.do_achilles = function (subcmd, opts, args, callback) {
    var self = this;
    if (opts.help) {
        this.do_help('help', {}, [subcmd], callback);
        return;
    }
    var smrt = self.smrt;

    async.parallel([
        function listMachines(next) {
            smrt.listHomericMachines(function (err, machines) {
                if (err || machines.length === 0)
                    return next(err);
                p('Delete %d Homeric machines.', machines.length);
                var machineIds = machines.map(function (m) { return m.id; });
                smrt.deleteMachines(machineIds, next);
            });
        },
        function listImages(next) {
            smrt.listHomericImages(function (err, images) {
                if (err || images.length === 0)
                    return next(err);
                p('Delete %d Homeric images.', images.length);
                var imageIds = images.map(function (img) { return img.id; });
                smrt.deleteImages(imageIds, next);
            });
        }
    ], callback);
};
CLI.prototype.do_achilles.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    }
];
CLI.prototype.do_achilles.help = (
    'Rage. Delete all Homeric machines [and images] for this profile.\n'
    + '\n'
    + 'Usage:\n'
    + '     {{name}} achilles\n'
    + '\n'
    + '{{options}}'
);


CLI.prototype.do_aphrodite = function (subcmd, opts, args, callback) {
    var self = this;
    if (opts.help) {
        this.do_help('help', {}, [subcmd], callback);
        return;
    }
    var smrt = self.smrt;

    var SSH = "ssh -q -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null";
    var ip;
    var sdcKeyInfo;
    async.series([
        function setupCoal(next) {
            if (opts.just_update_date) return next();
            p('Setting up COAL cloudapi (this may take a while)')
            //XXX How to handle not having a key?
            var cmd = (SSH + " root@10.99.99.7 "
                + "'/zones/$(vmadm lookup -1 alias=imgapi0)/root/opt/smartdc/imgapi/bin/coal-setup-dc-for-image-mgmt'");
            exec(cmd, function (err, stdout, stderr) {
                if (err) {
                    return next(new Error('error setting up COAL:\n'
                        + '    cmd: %s\n'
                        + '    exit status: %s\n'
                        + '    err: %s\n'
                        + '    stdout: %s\n'
                        + '    stderr: %s\n',
                        cmd, err.code, err, stdout, stderr));
                }
                next();
            });
        },
        function getCloudapiIP(next) {
            if (opts.just_update_date) return next();
            p('Get cloudapi IP.')
            // Presuming second NIC on cloudapi is the external.
            var cmd = (SSH + " root@10.99.99.7 "
                + "'vmadm get $(vmadm lookup -1 alias=cloudapi0) | json nics | json 1.ip'");
            exec(cmd, function (err, stdout, stderr) {
                if (err) {
                    return next(new Error('error getting cloudapi IP:\n'
                        + '    cmd: %s\n'
                        + '    exit status: %s\n'
                        + '    err: %s\n'
                        + '    stdout: %s\n'
                        + '    stderr: %s\n',
                        cmd, err.code, err, stdout, stderr));
                }
                ip = stdout.trim();
                next();
            });
        },
        function getSshKey(next) {
            if (opts.just_update_date) return next();
            p('Get "sdc" SSH key.')
            var cmd = (SSH + " root@10.99.99.7 "
                + "'/opt/smartdc/bin/sdc-sapi /applications?name=sdc "
                + "| json -H 0.metadata "
                + "| json -j SDC_PRIVATE_KEY SDC_PUBLIC_KEY SDC_KEY_ID'");
            exec(cmd, function (err, stdout, stderr) {
                if (err) {
                    return next(new Error('error getting sdc SSH key:\n'
                        + '    cmd: %s\n'
                        + '    exit status: %s\n'
                        + '    err: %s\n'
                        + '    stdout: %s\n'
                        + '    stderr: %s\n',
                        cmd, err.code, err, stdout, stderr));
                }
                sdcKeyInfo = JSON.parse(stdout);
                next();
            });
        },
        function setDate(next) {
            p('Update COAL time to avoid "clock skew" cloudapi auth errors.');
            if (opts.just_update_date) {
                p('Note: Typically cloudapi/UFDS take a minute or so to settle.')
            }
            // `date` wants this format: [ [mmdd] HHMM | mmddHHMM [cc] yy] [.SS]
            var d = new Date();
            var currTime = sprintf('%02d%02d%02d%02d%04d.%02d',
                d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(),
                d.getUTCMinutes(), d.getUTCFullYear(), d.getUTCSeconds())
            var cmd = SSH + " root@10.99.99.7 'date " + currTime + "'";
            exec(cmd, function (err, stdout, stderr) {
                if (err) {
                    return next(new Error('error setting COAL date:\n'
                        + '    cmd: %s\n'
                        + '    exit status: %s\n'
                        + '    err: %s\n'
                        + '    stdout: %s\n'
                        + '    stderr: %s\n',
                        cmd, err.code, err, stdout, stderr));
                }
                next();
            });
        },
        function coalProfile(next) {
            if (opts.just_update_date) return next();
            var prof = {
                name: 'coal',
                url: 'https://' + ip,
                account: 'admin',
                keyId: sdcKeyInfo.SDC_KEY_ID,
                privKey: sdcKeyInfo.SDC_PRIVATE_KEY,
                rejectUnauthorized: true
            };
            p('Create "coal" smrt profile (using "admin" user and its sdc key).');
            smrt.createOrUpdateProfile(prof, {setCurrent: true}, next);
        }
    ], callback)
};
CLI.prototype.do_aphrodite.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    },
    {
        names: ['just-update-date', 'd'],
        type: 'bool',
        help: 'Just update the date in COAL. This is for a quick turnaround '
            + 'when the problem is clock skew on a COAL from a slept laptop.'
    }
];
CLI.prototype.do_aphrodite.help = (
    'Setup your COAL for cloudapi usage, and setup a "coal" smrt profile.\n'
    + '\n'
    + 'Usage:\n'
    + '     {{name}} aphrodite\n'
    + '\n'
    + '{{options}}'
);


CLI.prototype.do_iris = function (subcmd, opts, args, callback) {
    var self = this;
    if (opts.help) {
        this.do_help('help', {}, [subcmd], callback);
        return;
    }
    var smrt = self.smrt;

    var hMachines, hImages, images;
    async.parallel([
        function homericMachines(next) {
            smrt.listHomericMachines(function (err, hMachines_) {
                if (err) return next(err);
                hMachines = hMachines_;
                next();
            });
        },
        function allImages(next) {
            smrt.listImages(function (err, images_) {
                if (err) return next(err);
                images = images_;
                hImages = images.filter(function (img) {
                    return (img.tags && img.tags.homeric === true);
                });
                next()
            });
        }
    ], function doneGathering(err) {
        if (err) return callback(err);
        var imageFromId = {};
        for (var i = 0; i < images.length; i++) {
            imageFromId[images[i].id] = images[i];
        }
        for (var j = 0; j < hMachines.length; j++) {
            var m = hMachines[j];
            m.imageNameVer = format('%s/%s',
                imageFromId[m.image].name,
                imageFromId[m.image].version);
        }
        if (opts.json) {
            p(JSON.stringify({
                machines: hMachines,
                images: hImages
            }, null, 4));
        } else {
            p('# %d Homeric machine%s\n', hMachines.length,
                (hMachines.length === 1 ? '' : 's'));
            if (hMachines.length === 0) {
                p('(none)');
            } else {
                common.tabulate(hMachines, {
                    columns: 'id,name,state,imageNameVer,package,primaryIp',
                    sort: 'created',
                    validFields: 'id,name,type,state,image,imageNameVer,memory,disk,created,updated,primaryIp,firewall_enabled,package'
                });
            }
            p('\n# %d Homeric image%s\n', hImages.length,
                (hImages.length === 1 ? '' : 's'));
            if (hImages.length === 0) {
                p('(none)');
            } else {
                common.tabulate(hImages, {
                    columns: 'id,name,version,state,os,public',
                    sort: 'published_at',
                    validFields: 'id,name,version,type,state,os,published_at'
                });
            }
        }
        callback();
    });
};
CLI.prototype.do_iris.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    },
    {
        names: ['json', 'j'],
        type: 'bool',
        help: 'Output as JSON.'
    }
    //TODO:
    //{
    //    names: ['all', 'a'],
    //    type: 'bool',
    //    help: 'List machines for all profiles.'
    //}
];
CLI.prototype.do_iris.help = (
    'List all Homeric machines and custom images for the current profile.\n'
    + '\n'
    + 'Usage:\n'
    + '     {{name}} iris\n'
    + '\n'
    + '{{options}}'
);



//---- exports

module.exports = CLI;
