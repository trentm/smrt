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
var fs = require('fs');


var assert = require('assert-plus');
var async = require('async');
var bunyan = require('bunyan');
var cmdln = require('cmdln'),
    Cmdln = cmdln.Cmdln;
var progbar = require('progbar');
var sprintf = require('extsprintf').sprintf;
var strsplit = require('strsplit');

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
            {names: ['verbose', 'v'], type: 'bool', help: 'Verbose/debug output.'},
            {names: ['profile', 'p'], type: 'string', env: 'SMRT_PROFILE',
                helpArg: 'NAME', help: 'SMRT Profile to use.'}
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
            self._smrt = new SMRT({profile: opts.profile, log: log});
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
            var currProfileName = this.smrt.profile.name;
            for (var i = 0; i < profs.length; i++) {
                profs[i].curr = (profs[i].name === currProfileName ? '*' : ' ');
            }
            if (opts.json) {
                p(JSON.stringify(profs, null, 4));
            } else {
                common.tabulate(profs, {
                    columns: 'curr,name,url,account,keyId,maxRam',
                    sort: 'url,account',
                    validFields: 'curr,name,url,account,keyId,maxRam'
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
        p('Set default profile to "%s".', name);
        this.smrt.setDefaultProfile(name, callback);
        return;
    }

    // Edit a profile.
    //XXX

    // Create a new profile.
    //XXX

    // Dump current profile
    var prof = this.smrt.profile;
    p('Profile "%s": %s (account=%s, keyId=%s)', prof.name, prof.url,
        prof.account, prof.keyId);
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

    // Determine num from '-n num' (if given) and/or args (if given).
    var num;
    var numOptGiven = (opts._order.filter(
        function (o) { return o.key === 'num'; }).length > 0);
    if (numOptGiven) {
        num = opts.num;
    } else if (args.length === 0) {
        num = opts.num; // Use the default number.
    } else {
        num = args.length;
    }

    var prof = smrt.profile;
    e('Launching %d machine%s using the "%s" smrt profile:\n'
        + '    SDC_URL=%s\n'
        + '    SDC_ACCOUNT=%s\n'
        + '    SDC_KEY_ID=%s\n',
        num, (num === 1 ? '' : 's'),
        prof.name, prof.url, prof.account, prof.keyId);

    var machines = [];
    for (var n = 0; n < num; n++) {
        var machine = {n: n};
        if (args.length) {
            var term = args[n % args.length];
            var parts = strsplit(term, ':', 3);
            machine.imgTerm = parts[0];
            if (parts[1]) {
                machine.pkgTerm = parts[1];
            }
            if (parts[2]) {
                machine.netTerms = strsplit(parts[2], ',');
            }
        }
        machines.push(machine);
    }
    var now = (new Date()).toISOString().replace(
        /[-:]/g, '').replace(/\.\d+/, '');
    var bar;

    async.series([
        // Fill smrt's cloudapi caches so we don't call them for each machine.
        function fillCaches(next) {
            smrt.listImages(function () {
                smrt.listPackages(function () {
                    smrt.listNetworks(next);
                });
            });
        },
        function gatherMachineData(next) {
            async.each(
                machines,
                function gather(m, next2) {
                    m.name = smrt.randomNameSync('greeks').replace(/ /g, '-')
                        + '-' + now + '-' + m.n;
                    smrt.randomImage(m.imgTerm, function (imgErr, img) {
                        if (imgErr)
                            return next2(imgErr);
                        m.img = img;
                        smrt.randomPackage(prof, img, m.pkgTerm,
                            function (pkgErr, pkg) {
                                if (pkgErr)
                                    return next2(pkgErr);
                                m.pkg = pkg;
                                smrt.randomNetworks(prof, m.netTerms,
                                    function (netsErr, nets) {
                                        if (netsErr)
                                            return next2(netsErr);
                                        m.nets = nets;
                                        next2();
                                    }
                                );
                            }
                        );
                    });
                },
                next
            );
        },
        function provisionMachines(next) {
            bar = new progbar.ProgressBar({
                filename: num + ' machine' + (num === 1 ? '' : 's'),
                size: num
            });
            if (opts.stagger) {
                for (var i = 0; i < machines.length; i++) {
                    machines[i].delay = i * opts.stagger * 1000;
                }
            } else {
                // Ensure don't hit 10 req/s cloudapi limit.
                for (var i = 5; i < machines.length; i += 5) {
                    machines[i].delay = 1000;
                }
            }
            async.each(machines, createMachineAndWait, next);
        }
    ], function done(err) {
        if (bar)
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
                    if (imageFromId[m.image]) {
                        m.imageNameVer = format('%s/%s',
                            imageFromId[m.image].name,
                            imageFromId[m.image].version);
                    } else {
                        m.imageNameVer = m.image;
                    }
                }
                e(/* blank line */);
                common.tabulate(machines, {
                    columns: 'id,name,state,imageNameVer,package,primaryIp',
                    sort: 'n',
                    validFields: 'n,id,name,type,state,image,imageNameVer,memory,disk,created,updated,primaryIp,firewall_enabled,package'
                });
                callback();
            });
        }
    });

    function createMachineAndWait(machine, cb) {
        async.series([
            function preDelay(next) {
                if (machine.delay) {
                    setTimeout(next, machine.delay)
                } else {
                    next();
                }
            },
            function createMachine(next) {
                var createOpts = {
                    name: machine.name,
                    // TODO: description is details about the name
                    'tag.homeric': true,
                    image: machine.img.id,
                    'package': machine.pkg.name,
                    networks: (machine.nets
                        ? machine.nets.map(function (n) { return n.id; })
                        : undefined),
                    //'metadata.user-data': '{"this": "is my user-data"}',
                    //'metadata.user-script': '#!/bin/bash\necho hi from my user-script at $(date) >>/var/log/smrt.log',
                    //'metadata.user-script': 'echo hi from my user-script at $(date) >>/var/log/smrt.log',
                    'metadata.homeric': 'welcome to smrt'
                };
                smrt.createMachine(createOpts, function (err, initialMach) {
                    if (err) {
                        e('Create machine "%s" (%s %s, %s) failed: %s',
                            machine.name, machine.img.name, machine.img.version,
                            machine.pkg.name, err);
                        machine.err = err;
                        return next();
                    }
                    e('Creating machine "%s" (%s %s, %s): id %s',
                        machine.name, machine.img.name, machine.img.version,
                        machine.pkg.name, initialMach.id);
                    machine.initial = initialMach;
                    next();
                });
            },
            function waitForProvision(next) {
                if (!machine.initial) {
                    bar.advance(1);
                    return next();
                }
                var waitOpts = {
                    id: machine.initial.id,
                    // Max cloudapi req rate is 10/s. Let's adjust the poll
                    // interval to max out at about half that rate:
                    //      N machines / 5 req/s = interval in seconds
                    //      min interval of 1s
                    interval: Math.max(1000, num / 5 * 1000)
                };
                smrt.waitForMachineProvision(waitOpts, function (err, finalMach) {
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
            },
            // TODO maybe
            //function sshCheck(next) {
            //    if (!opts.ssh) {
            //        return next();
            //    }
            //    XXX
            //}
        ], cb);
    }
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
        names: ['stagger'],
        type: 'positiveInteger',
        helpArg: '<delay>',
        help: 'A number seconds to stagger parallel machine create requests.'
            + ' The default is 0 (i.e. no stagger).',
        'default': 0
    },
    // TODO maybe
    //{
    //    names: ['ssh'],
    //    type: 'bool',
    //    help: 'Do an SSH check to the created machine immediately after it is "running".'
    //},
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
    + '     {{name}} helen [-n <num>] [<image>[:<package>[:<networks>]] ...]\n'
    + '\n'
    + '{{options}}'
    + '\n'
    + 'Without args "helen" will create 3 machines using random images and\n'
    + 'packages (currently skipping Windows images). You can use "-n" and/or\n'
    + 'arguments to control the number of machines created. If arg a provided\n'
    + 'then that many machines will be created. If both args and "-n" are\n'
    + 'then "-n" wins.\n'
    + '\n'
    + '"<image>" can be specified to select a particular image. The string\n'
    + 'give can be an image id (the UUID), name or name substring. If <image>\n'
    + 'matches multiple images, then the used image is selected randomly from\n'
    + 'those matches.\n'
    + '\n'
    + '"<package>" can be specified to select a particular package. As with\n'
    + 'image above, the string can be a package id (the UUID), name or name\n'
    + 'substring. Some filtering is done to ensure only packages relevant\n'
    + 'for the selected image are used.\n'
    + '\n'
    + '"<networks>" is an optional comma-separated list of networks to use\n'
    + 'for the provision. As with image above, the string can be a network id\n'
    + '(the UUID), name or name substring.\n'
);


CLI.prototype.do_achilles = function (subcmd, opts, args, callback) {
    var self = this;
    if (opts.help) {
        this.do_help('help', {}, [subcmd], callback);
        return;
    }
    var smrt = self.smrt;

    async.series([
        function listMachines(next) {
            smrt.listHomericMachines(function (err, machines) {
                if (err || machines.length === 0)
                    return next(err);
                // Randomize machine list order (for simultaneous calls for lots
                // of machines).
                common.shuffleArray(machines);
                async.eachLimit(machines, 2,
                    function delMachine(machine, nextMachine) {
                        p('Delete Homeric machine "%s" (%s)', machine.id,
                            machine.name);
                        var start = Date.now()
                        if (opts.dry_run) {
                            return nextMachine();
                        }
                        smrt.deleteMachine(machine.id, function (err) {
                            log.debug('Deleted machine %s: latency=%ss err=%s',
                                machine.id, (Date.now() - start) / 1000, err);
                            nextMachine();
                        });
                    },
                    next);
            });
        },
        function listImages(next) {
            if (opts.skip_images) {
                return next();
            }
            smrt.listHomericImages(function (err, images) {
                if (err || images.length === 0)
                    return next(err);
                async.eachLimit(images, 2,
                    function delImage(image, nextImage) {
                        p('Delete Homeric image "%s" (%s/%s)', image.id,
                            image.name, image.version);
                        if (opts.dry_run) {
                            return nextImage();
                        }
                        smrt.deleteImage(image.id, nextImage);
                    },
                    next);
            });
        }
    ], callback);
};
CLI.prototype.do_achilles.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    },
    {
        names: ['skip-images', 'I'],
        type: 'bool',
        help: 'Skip images, just destroy machines.'
    },
    {
        names: ['dry-run', 'n'],
        type: 'bool',
        help: 'Dry-run.'
    }
];
CLI.prototype.do_achilles.help = (
    'Rage. Delete all Homeric machines and images for this profile.\n'
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
                    return next(new Error(format('error setting up COAL:\n'
                        + '    cmd: %s\n'
                        + '    exit status: %s\n'
                        + '    err: %s\n'
                        + '    stdout: %s\n'
                        + '    stderr: %s\n',
                        cmd, err.code, err, stdout, stderr)));
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
                    return next(new Error(format('error getting cloudapi IP:\n'
                        + '    cmd: %s\n'
                        + '    exit status: %s\n'
                        + '    err: %s\n'
                        + '    stdout: %s\n'
                        + '    stderr: %s\n',
                        cmd, err.code, err, stdout, stderr)));
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
                    return next(new Error(format('error getting sdc SSH key:\n'
                        + '    cmd: %s\n'
                        + '    exit status: %s\n'
                        + '    err: %s\n'
                        + '    stdout: %s\n'
                        + '    stderr: %s\n',
                        cmd, err.code, err, stdout, stderr)));
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
                    return next(new Error(format('error setting COAL date:\n'
                        + '    cmd: %s\n'
                        + '    exit status: %s\n'
                        + '    err: %s\n'
                        + '    stdout: %s\n'
                        + '    stderr: %s\n',
                        cmd, err.code, err, stdout, stderr)));
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
                rejectUnauthorized: false
            };
            p('Create "coal" smrt profile (using "admin" user and its sdc key).');
            smrt.createOrUpdateProfile(prof, {setDefault: false}, next);
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
    + 'Use "smrt paris coal" to set this as your new default profile.\n'
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

    var smrts = [self.smrt];
    if (opts.all) {
        smrts = self.smrt.profiles.map(function (p) {
            return new SMRT({profile: p.name, log: log});
        });
    }

    var hMachines = [];
    var hImages = [];
    var imagesFromProf = {};
    async.each(
        smrts,
        function gather(smrt, nextSmrt) {
            var profName = smrt.profile.name;
            async.series([
                function homericMachines(next) {
                    smrt.listHomericMachines(function (err, hMachines_) {
                        if (err) return next(err);
                        hMachines_.forEach(function (m) {
                            m.profile = profName;
                            hMachines.push(m);
                        })
                        next();
                    });
                },
                function allImages(next) {
                    smrt.listImages(function (err, images) {
                        if (err) return next(err);
                        imagesFromProf[profName] = images;
                        next()
                    });
                },
                function homericImages(next) {
                    smrt.listHomericImages(function (err, hImages_) {
                        if (err) return next(err);
                        hImages_.forEach(function (i) {
                            i.profile = profName;
                            hImages.push(i);
                        })
                        next()
                    });
                }
            ], function (err) {
                if (err) {
                    e('warning: error gathering data for %s profile: %s',
                        profName, err);
                }
                log.debug('gathered data for "%s" profile', profName)
                nextSmrt();
            });
        },
        function doneGathering(err) {
            if (err) return callback(err);
            var j, k;
            var imageFromIdFromProf = {};
            Object.keys(imagesFromProf).forEach(function (prof) {
                var images = imagesFromProf[prof];
                var imageFromId = imageFromIdFromProf[prof] = {};
                for (j = 0; j < images.length; j++) {
                    imageFromId[images[j].id] = images[j];
                }
            });
            for (j = 0; j < hMachines.length; j++) {
                var m = hMachines[j];
                var image = imageFromIdFromProf[m.profile][m.image];
                if (image) {
                    m.img = format('%s/%s', image.name, image.version);
                } else {
                    m.img = m.image;
                }
                m.shortId = m.id.split('-', 1)[0];
            }
            for (j = 0; j < hImages.length; j++) {
                var i = hImages[j];
                i.shortId = i.id.split('-', 1)[0];
                // Need PUBAPI-720 first for this.
                //if (i.origin) {
                //    i.orig = format('%s/%s',
                //        imageFromId[i.origin].name,
                //        imageFromId[i.origin].version);
                //} else {
                //    i.orig = null;
                //}
            }
            if (opts.json) {
                p(JSON.stringify({
                    machines: hMachines,
                    images: hImages
                }, null, 4));
            } else {
                var profStr = '';
                if (!opts.all) {
                    profStr = format(' (profile %s)', smrts[0].profile.name);
                }

                p('# %d Homeric machine%s%s\n',
                    hMachines.length, (hMachines.length === 1 ? '' : 's'),
                    profStr);
                if (hMachines.length === 0) {
                    p('(none)');
                } else {
                    //XXX want long id by default for now. Can switch to
                    //    shortId when all the other smrt commands
                    //    supports expanding that
                    var columns = 'id,name,state,img,package,primaryIp';
                    if (opts.long) {
                        columns = 'id,name,state,img,package,primaryIp';
                    }
                    if (opts.all) {
                        columns = 'profile,' + columns
                    }
                    common.tabulate(hMachines, {
                        columns: columns,
                        sort: 'profile,created',
                        validFields: 'profile,shortId,id,name,type,state,image,img,memory,disk,created,updated,primaryIp,firewall_enabled,package'
                    });
                }
                p('\n# %d Homeric image%s%s\n',
                    hImages.length, (hImages.length === 1 ? '' : 's'),
                    profStr);
                if (hImages.length === 0) {
                    p('(none)');
                } else {
                    var columns = 'shortId,name,version,state,os,public';
                    if (opts.long) {
                        columns = 'id,name,version,state,os,public';
                    }
                    if (opts.all) {
                        columns = 'profile,' + columns
                    }
                    common.tabulate(hImages, {
                        columns: columns,
                        sort: 'profile,published_at',
                        validFields: 'profile,shortId,id,name,version,type,state,os,published_at,public'
                    });
                }
            }
            callback();
        }
    );
};
CLI.prototype.do_iris.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    },
    {
        names: ['long', 'l'],
        type: 'bool',
        help: 'Long output format.'
    },
    {
        names: ['json', 'j'],
        type: 'bool',
        help: 'Output as JSON.'
    },
    {
        names: ['all', 'a'],
        type: 'bool',
        help: 'List for all profiles.'
    }
];
CLI.prototype.do_iris.help = (
    'List all Homeric machines and custom images.\n'
    + '\n'
    + 'Usage:\n'
    + '     {{name}} iris [<options>]\n'
    + '\n'
    + '{{options}}'
);



CLI.prototype.do_hermes = function (subcmd, opts, args, callback) {
    var self = this;
    if (opts.help) {
        this.do_help('help', {}, [subcmd], callback);
        return;
    }
    var smrt = self.smrt;

    // Ping command using a 5s timeout (`ping` differs on smartos vs mac).
    var ping = 'ping -c 3 -t 5 %s';
    if (process.platform === 'sunos') {
        ping = 'ping %s 5';
    }

    var runningMachines;
    var ssh;
    var haveSshErrors = false;
    async.series([
        function getRunningMachines(next) {
            smrt.listHomericMachines(function (listErr, machines) {
                if (listErr)
                    return next(listErr);
                runningMachines = machines.filter(
                    function (m) { return m.state === 'running'; });
                next();
            });
        },
        function pingEm(next) {
            async.each(
                runningMachines,
                function pingMachine(machine, next) {
                    var ip = machine.primaryIp;
                    var cmd = format(ping, ip);
                    var execOpts = {
                        timeout: 30000
                    };
                    log.debug({cmd: cmd}, 'ping');
                    exec(cmd, execOpts, function (err, stdout, stderr) {
                        log.debug({cmd: cmd, err: err, stdout: stdout, stderr: stderr},
                            'ping exec result');
                        if (err) {
                            machine.ping = false;
                        } else {
                            machine.ping = true;
                        }
                        next();
                    });
                    // TODO:
                    // - if privKey then add -i /path/to/it
                    // - var cmd = 'ssh -q -o StrictHostKeyChecking=no '
                    //    + '-o UserKnownHostsFile=/dev/null -i /path/to/it';
                },
                next);
        },
        function prepSsh(next) {
            var prof = smrt.profile;
            ssh = 'ssh -T -o StrictHostKeyChecking=no '
                + '-o UserKnownHostsFile=/dev/null '
                + '-o PasswordAuthentication=no '
                + '-o NumberOfPasswordPrompts=0 ';
            if (!prof.privKey) {
                next();
            } else {
                var privKeyPath = format('/tmp/.smrt-%s-privKey', prof.name);
                ssh += '-i ' + privKeyPath;
                fs.writeFile(privKeyPath, prof.privKey, 'utf8', function (err) {
                    if (err) return next(err);
                    fs.chmod(privKeyPath, 0600, next);
                });
            }
        },
        function sshToEm(next) {
            async.each(
                runningMachines,
                function sshToMachine(machine, next) {
                    // TODO: ubuntu for cert images
                    var cmd = ssh + ' root@' + machine.primaryIp + ' "echo hi"';
                    var execOpts = {
                        timeout: 30000
                    };
                    log.debug({cmd: cmd}, 'sshToMachine');
                    exec(cmd, execOpts, function (err, stdout, stderr) {
                        log.debug({cmd: cmd, err: err, stdout: stdout, stderr: stderr},
                            'sshToMachine exec result');
                        if (err) {
                            machine.ssh = false;
                            machine.sshErr = err;
                            haveSshErrors = true;
                        } else {
                            machine.ssh = true;
                        }
                        next();
                    });
                    // TODO:
                    // - if privKey then add -i /path/to/it
                    // - var cmd = 'ssh -q -o StrictHostKeyChecking=no '
                    //    + '-o UserKnownHostsFile=/dev/null -i /path/to/it';
                },
                next);
        }
    ], function showResults(err) {
        if (err) {
            return callback(err);
        }
        if (opts.json) {
            p(JSON.stringify(runningMachines, null, 4));
        } else {
            var columns = 'id,name,state,primaryIp,ping,ssh';
            if (haveSshErrors) {
                columns += ',sshErr';
            }
            common.tabulate(runningMachines, {
                columns: 'id,name,state,primaryIp,ping,ssh',
                sort: 'created',
                validFields: 'ping,ssh,sshErr,id,name,type,state,image,memory,disk,created,updated,primaryIp,firewall_enabled,package'
            });
        }
        callback();
    });
};
CLI.prototype.do_hermes.options = [
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
];
CLI.prototype.do_hermes.help = (
    'Ping all running Homeric machines.\n'
    + '\n'
    + 'Usage:\n'
    + '     {{name}} hermes\n'
    + '\n'
    + '{{options}}'
);


CLI.prototype.do_trojan = function (subcmd, opts, args, callback) {
    var self = this;
    if (opts.help) {
        this.do_help('help', {}, [subcmd], callback);
        return;
    }
    if (args.length < 1 && !opts.existing_machine) {
        return callback(new Error('not enough args'));
    }
    var smrt = self.smrt;

    var now = (new Date()).toISOString().replace(
        /[-:]/g, '').replace(/\.\d+/, '');
    var protoImg;
    var protoName;
    var protoPkg;
    var proto = {};
    var protoSsh;
    var privKeyPath;
    var img;
    async.series([
        // This block is for the `smrt trojan <img-name> [<trojan-script>]`
        // form.
        function chooseProtoName(next) {
            if (opts.existing_machine)
                return next();
            protoName = smrt.randomNameSync('greeks').replace(/ /g, '-')
                + '-' + now + '-i';
            //p('protoName:', protoName);
            next();
        },
        function findProtoImage(next) {
            if (opts.existing_machine)
                return next();
            var protoImgTerm = args[0];
            smrt.latestImage(protoImgTerm, function (err, img_) {
                if (err) {
                    return next(err);
                }
                e('Choose proto image: %s (%s %s)', img_.id, img_.name,
                    img_.version);
                protoImg = img_;
                //e('protoImg:', protoImg);
                next(err);
            });
        },
        function chooseProtoPackage(next) {
            if (opts.existing_machine)
                return next();
            smrt.getImageCreationPackage(protoImg, function (err, pkg) {
                e('Choose proto package: %s (%s)', pkg.name, pkg.id);
                protoPkg = pkg;
                //e('protoPkg:', protoPkg);
                next(err);
            });
        },
        function createProtoMachine(next) {
            if (opts.existing_machine)
                return next();
            var createOpts = {
                name: protoName,
                'tag.homeric': true,
                'tag.image_creation': true,
                image: protoImg.id,
                'package': protoPkg.id
            };
            //e('proto createOpts', createOpts)
            smrt.createMachine(createOpts, function (err, initialMach) {
                if (err) {
                    e('Create proto machine "%s" (%s %s, %s) failed: %s',
                        protoName, protoImg.name, protoImg.version,
                        protoPkg.name, err);
                    proto.err = err;
                    return next(err);
                }
                e('Creating proto machine "%s" (%s %s, %s): id %s',
                    protoName, protoImg.name, protoImg.version, protoPkg.name,
                    initialMach.id);
                proto.initial = initialMach;
                next();
            });
        },
        function waitForProtoProvision(next) {
            if (opts.existing_machine)
                return next();
            if (!proto.initial) {
                return next();
            }
            var id = proto.initial.id;
            smrt.waitForMachineProvision({id: id}, function (err, finalMach) {
                if (err) {
                    proto.err = err;
                    return next();
                } else if (finalMach.state !== 'running') {
                    return next(new Error('failed to provision proto machine'));
                }
                delete proto.initial;
                Object.keys(finalMach).forEach(function (k) {
                    proto[k] = finalMach[k];
                });
                p('Proto machine is running at IP %s', proto.primaryIp);
                next();
            });
        },
        function prepSsh(next) {
            if (opts.existing_machine)
                return next();
            var prof = smrt.profile;
            protoSsh = 'ssh -o StrictHostKeyChecking=no '
                + '-o UserKnownHostsFile=/dev/null '
                + '-o PasswordAuthentication=no '
                + '-o NumberOfPasswordPrompts=0 ';
            if (!prof.privKey) {
                protoSsh += 'root@' + proto.primaryIp;
                return next();
            }
            privKeyPath = format('/tmp/.smrt-%s-privKey', prof.name);
            protoSsh += '-i ' + privKeyPath + ' root@' + proto.primaryIp;
            fs.writeFile(privKeyPath, prof.privKey, 'utf8', function (err) {
                if (err) return next(err);
                fs.chmod(privKeyPath, 0600, next);
            });
        },
        // At least in beta4 there is some networking SNAFU where SSH to the
        // just created zone doesn't work even though it returned "running".
        function waitForSsh(next) {
            if (opts.existing_machine)
                return next();
            p('Waiting for SSH to the proto VM to come up (start at %s).',
                (new Date()).toISOString());
            var start = Date.now();
            var loggedOneError = false;
            function tryOnce() {
                var cmd = protoSsh + " 'echo hi'";
                log.debug({cmd: cmd}, 'waitForSsh');
                var execOpts = {
                    timeout: 5000
                };
                exec(cmd, execOpts, function (err, stdout, stderr) {
                    log.debug({cmd: cmd, err: err, stdout: stdout, stderr: stderr},
                        'waitForSsh exec result');
                    var end = Date.now();
                    if (!err) {
                        if (!log.debug()) process.stderr.write('\n');
                        next();
                    } else if (end - start > 5 * 60 * 1000 /* 5 minutes */) {
                        if (!log.debug()) process.stderr.write('\n');
                        next(new Error('SSH to VM still does not work after 5 minutes'));
                    } else {
                        if (!log.debug()) process.stderr.write('.');
                        if (!loggedOneError &&
                            end - start > 1 * 60 * 1000 /* 1 minute */)
                        {
                            e('SSH to proto still failing after 1 minute, will '
                                + 'keep trying for 4 more minutes: %s (stderr=%s)',
                                err, stderr);
                            loggedOneError = true;
                        }
                        setTimeout(tryOnce, 10000);
                    }
                });
            }
            setTimeout(tryOnce, 1000);
        },
        function customize(next) {
            if (opts.existing_machine)
                return next();
            // XXX START HERE: custom trojan script
            e('Customize the machine.')
            // On some current Ubuntu images /etc/motd is overwritten on
            // login... it includes motd.tail, so do that too. And motd.tail
            // is overwritten on current debian images, so /etc/smrt.log it is.
            var cmd = protoSsh + " 'echo This was smrtified. >>/etc/motd; echo This was smrtified. >>/etc/smrt.log; echo This was smrtified. >>/etc/motd.tail'";
            //e('customize cmd:', cmd)
            var execOpts = {
                timeout: 30000,
                maxBuffer: 1024 * 1024
            };
            log.debug({cmd: cmd}, 'customize');
            exec(cmd, execOpts, function (err, stdout, stderr) {
                log.debug({cmd: cmd, err: err, stdout: stdout, stderr: stderr},
                    'customize exec result');
                if (err) {
                    return next(new Error(format('error customizing proto machine:\n'
                        + '    cmd: %s\n'
                        + '    exit status: %s\n'
                        + '    err: %s\n'
                        + '    stdout: %s\n'
                        + '    stderr: %s\n',
                        cmd, err.code, err, stdout, stderr)));
                }
                next();
            });
        },
        function prepare(next) {
            if (opts.existing_machine)
                return next();
            e('Prepare the machine for imaging and shut it down.')
            var cmd;
            if (protoImg.os === 'smartos') {
                cmd = protoSsh + " 'sm-prepare-image -y'";
            } else if (protoImg.os === 'linux') {
                cmd = protoSsh + " 'cd /var/tmp && wget https://download.joyent.com/pub/prepare-image/linux-prepare-image && yes | bash linux-prepare-image'";
            } else {
                return next(new Error(format(
                    'do not support prepare-image for os "%s"', protoImg.os)));
            }
            //e('prepare cmd:', cmd)
            var execOpts = {
                timeout: 30000,
                maxBuffer: 1024 * 1024
            };
            exec(cmd, execOpts, function (err, stdout, stderr) {
                if (err) {
                    return next(new Error(format('error preparing proto machine:\n'
                        + '    cmd: %s\n'
                        + '    exit status: %s\n'
                        + '    err: %s\n'
                        + '    stdout: %s\n'
                        + '    stderr: %s\n',
                        cmd, err.code, err, stdout, stderr)));
                }
                next();
            });
        },
        function waitForProtoStop(next) {
            if (opts.existing_machine)
                return next();
            e('Wait for proto machine to stop.')
            smrt.waitForMachineStop(proto.id, 30, next);
        },

        // This block is for the `smrt trojan -e <machine-uuid>` form.
        function getExistingProtoMachine(next) {
            if (!opts.existing_machine)
                return next();
            smrt.getMachine(opts.existing_machine, function (err, machine) {
                if (err) return next(err);
                e('Using the existing machine "%s" for imaging.', machine.name);
                proto = machine;
                next();
            });
        },
        function getExistingProtoImage(next) {
            if (!opts.existing_machine)
                return next();
            smrt.getImage(proto.image, function (err, image) {
                protoImg = image;
                next(err);
            });
        },

        function createImage(next) {
            var createOpts = {
                machine: proto.id,
                name: smrt.randomNameSync('trojans').replace(/ /g, '-'),
                //TODO: description
                version: now,
                tags: {
                    homeric: true
                }
            };
            smrt.createImageFromMachine(createOpts, function (err, initialImg) {
                if (err) {
                    e('Create image %s (version %s) failed: %s',
                        createOpts.name, createOpts.version, err);
                    return next(err);
                }
                e('Creating image %s (version %s): id %s',
                    createOpts.name, createOpts.version, initialImg.id);
                img = initialImg;
                next();
            });
        },
        function waitForImageCreate(next) {
            smrt.waitForImageCreate(img.id, 60, function (err, finalImg) {
                if (err) {
                    return next(err);
                } else if (finalImg.state !== 'active') {
                    return next(new Error(format(
                        'failed to create image: state is "%s", not "active"',
                        finalImg.state)));
                }
                img = finalImg;
                next();
            });
        },
        function printResults(next) {
            e("Image %s (%s %s) created.", img.id, img.name, img.version);
            p(JSON.stringify(img, null, 4));
            next();
        },
    ], function finishUp(err) {
        async.series([
            function delProto(next) {
                if (proto && proto.id && !opts.existing_machine) {
                    smrt.deleteMachine(proto.id, function (delErr) {
                        if (delErr) {
                            console.warn('smrt trojan: warning: error deleting '
                                + 'proto machine %s: %s', proto.id, delErr);
                        }
                        next();
                    });
                } else {
                    next();
                }
            },
            // TODO: pull this up into the async.series
            function helen(next) {
                if (err || !opts.helen || opts.helen.length === 0) {
                    return next();
                }
                var argv = [process.execPath, 'smrt', 'helen'];
                if (opts.json) {
                    argv.push('--json');
                }
                argv = argv.concat(opts.helen.map(
                    function (h) { return img.id + ':' + h; }));
                self.dispatch('helen', argv, next);
            }
        ], function done(finishUpErr) {
            callback(err || finishUpErr);
        });
    })
};
CLI.prototype.do_trojan.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    },
    {
        names: ['existing-machine', 'e'],
        type: 'string',
        help: 'Use an existing prepared and stopped machine.'
    },
    {
        names: ['helen', 'H'],
        type: 'arrayOfString',
        helpArg: '<package>',
        help: 'Launch a machine using the created image and a package matching '
            + 'the given <package>. Can be called multiple types for multiple '
            + 'machines'
    },
    {
        names: ['json', 'j'],
        type: 'bool',
        help: 'Output as JSON.'
    }
];
CLI.prototype.do_trojan.help = (
    'Create a Homeric custom image.\n'
    + '\n'
    + 'Usage:\n'
    + '     {{name}} trojan <origin-image-name> [<trojan-script-or-command>]\n'
    + '     {{name}} trojan -e <vm-uuid>  # create image from existing machine\n'
    + '\n'
    + '{{options}}\n'
    + 'The "trojan" here is the script run to customize the machine before\n'
    + 'imaging. If not given, then /etc/motd will be customized.\n'
    + '\n'
    + 'In the first form a new proto VM is created, customized (optionally\n'
    + 'using the given trojan script or command), prepare, stopped, imaged,\n'
    + 'and destroy. In the second form an existing *prepare and stopped* VM\n'
    + 'is used for imaging. The existing VM is not destroyed.\n'
);


CLI.prototype.do_images = function (subcmd, opts, args, callback) {
    var self = this;
    if (opts.help) {
        this.do_help('help', {}, [subcmd], callback);
        return;
    }
    var smrt = self.smrt;

    smrt.listImages(function (err, images) {
        if (err)
            return callback(err);
        if (opts.json) {
            p(JSON.stringify(images, null, 4));
        } else {
            if (images.length === 0) {
                p('(none)');
            } else {
                common.tabulate(images, {
                    columns: 'id,name,version,state,os,published_at',
                    sort: opts.sort || 'published_at',
                    validFields: 'id,name,version,type,state,os,published_at,public'
                });
            }
        }
        callback();
    });
};
CLI.prototype.do_images.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    },
    {
        names: ['json', 'j'],
        type: 'bool',
        help: 'Output as JSON.'
    },
    {
        names: ['sort', 's'],
        type: 'string',
        help: 'Sort by the given fields (separate multiple column names with a comma).'
    }
];
CLI.prototype.do_images.help = (
    'List all available images\n'
    + '... for use with "helen" and "trojan" commands.\n'
    + '\n'
    + 'Usage:\n'
    + '     {{name}} images\n'
    + '\n'
    + '{{options}}'
);

CLI.prototype.do_packages = function (subcmd, opts, args, callback) {
    var self = this;
    if (opts.help) {
        this.do_help('help', {}, [subcmd], callback);
        return;
    }
    var smrt = self.smrt;

    smrt.listPackages(function (err, packages) {
        if (err)
            return callback(err);
        if (opts.json) {
            p(JSON.stringify(packages, null, 4));
        } else {
            if (packages.length === 0) {
                p('(none)');
            } else {
                common.tabulate(packages, {
                    columns: 'id,name,memory,disk,group',
                    sort: 'group,name',
                    validFields: 'id,name,version,group,description,memory,disk,swap,vcpus'
                });
            }
        }
        callback();
    });
};
CLI.prototype.do_packages.options = [
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
];
CLI.prototype.do_packages.help = (
    'List all available packages\n'
    + '... for use with "helen".\n'
    + '\n'
    + 'Usage:\n'
    + '     {{name}} packages\n'
    + '\n'
    + '{{options}}'
);


CLI.prototype.do_machines = function (subcmd, opts, args, callback) {
    var self = this;
    if (opts.help) {
        this.do_help('help', {}, [subcmd], callback);
        return;
    }
    var smrt = self.smrt;

    smrt.listMachines(function (err, machines) {
        if (err)
            return callback(err);
        if (opts.json) {
            p(JSON.stringify(machines, null, 4));
        } else if (machines.length) {
            // TODO: add shortId, img
            common.tabulate(machines, {
                columns: 'id,name,state,package,primaryIp',
                sort: 'created',
                validFields: 'id,name,type,state,image,memory,disk,created,updated,primaryIp,firewall_enabled,package'
            });
        }
        callback();
    });
};
CLI.prototype.do_machines.options = [
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
];
CLI.prototype.do_machines.help = (
    'List all current machines (not just Homeric ones that `iris` lists).\n'
    + '\n'
    + 'Usage:\n'
    + '     {{name}} machines\n'
    + '\n'
    + '{{options}}'
);


CLI.prototype.do_networks = function (subcmd, opts, args, callback) {
    var self = this;
    if (opts.help) {
        this.do_help('help', {}, [subcmd], callback);
        return;
    }
    var smrt = self.smrt;

    smrt.listNetworks(function (err, networks) {
        if (err)
            return callback(err);
        if (opts.json) {
            p(JSON.stringify(networks, null, 4));
        } else {
            if (networks.length === 0) {
                p('(none)');
            } else {
                common.tabulate(networks, {
                    columns: 'id,name,public',
                    sort: 'name',
                    validFields: 'id,name,public'
                });
            }
        }
        callback();
    });
};
CLI.prototype.do_networks.options = [
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
];
CLI.prototype.do_networks.help = (
    'List all available networks\n'
    + '\n'
    + 'Usage:\n'
    + '     {{name}} networks\n'
    + '\n'
    + '{{options}}'
);

CLI.prototype.do_stop = function (subcmd, opts, args, callback) {
    var self = this;
    if (opts.help) {
        this.do_help('help', {}, [subcmd], callback);
        return;
    }
    var smrt = self.smrt;

    if (args.length === 0) {
        return callback(new Error('no machine IDs were given to stop'));
    }

    async.each(
        args,
        function stopMach(machineId, next) {
            // TODO: support abbreviated IDs
            p('Stop machine %s', machineId);
            smrt.stopMachine(machineId, next);
        },
        callback);
    // TODO: option to wait until all stopped
};
CLI.prototype.do_stop.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    }
];
CLI.prototype.do_stop.help = (
    'Stop the given machine(s)\n'
    + '\n'
    + 'Usage:\n'
    + '     {{name}} stop <machine-id>...\n'
    + '\n'
    + '{{options}}'
);




//---- exports

module.exports = CLI;
