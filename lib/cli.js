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

    var prof = smrt.currProfile;
    e('Launching %d machine%s using the "%s" smrt profile:\n'
        + '    SDC_URL=%s\n'
        + '    SDC_ACCOUNT=%s\n'
        + '    SDC_KEY_ID=%s\n',
        num, (num === 1 ? '' : 's'),
        smrt.currProfileName, prof.url, prof.account, prof.keyId);

    var machines = [];
    for (var n = 0; n < num; n++) {
        var machine = {n: n};
        if (args.length) {
            var term = args[n % args.length];
            var colon = term.indexOf(':');
            if (colon === -1) {
                machine.imgTerm = term;
            } else {
                machine.imgTerm = term.slice(0, colon);
                machine.pkgTerm = term.slice(colon + 1);
            }
        }
        machines.push(machine);
    }
    var now = (new Date()).toISOString().replace(
        /[-:]/g, '').replace(/\.\d+/, '');
    var bar;

    async.series([
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
                        smrt.randomPackage(img, m.pkgTerm, function (pkgErr, pkg) {
                            if (pkgErr)
                                return next2(pkgErr);
                            m.pkg = pkg;
                            next2();
                        });
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
                    m.imageNameVer = format('%s/%s',
                        imageFromId[m.image].name,
                        imageFromId[m.image].version);
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
            function createMachine(next) {
                var createOpts = {
                    name: machine.name,
                    // TODO: description is details about the name
                    'tag.homeric': true,
                    image: machine.img.id,
                    'package': machine.pkg.name
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
                next()
            });
        },
        function homericImages(next) {
            smrt.listHomericImages(function (err, images_) {
                if (err) return next(err);
                hImages = images_;
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
                    validFields: 'id,name,version,type,state,os,published_at,public'
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

    smrt.listHomericMachines(function (listErr, machines) {
        if (listErr)
            return next(listErr);
        var runningMachines = machines.filter(
            function (m) { return m.state === 'running'; });
        async.each(
            runningMachines,
            function pingMachine(machine, next) {
                var ip = machine.primaryIp;
                var cmd = format(ping, ip);
                exec(cmd, function (err, stdout, stderr) {
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
            function showResults(err) {
                if (err) {
                    return callback(err);
                }
                if (opts.json) {
                    p(JSON.stringify(runningMachines, null, 4));
                } else {
                    common.tabulate(runningMachines, {
                        columns: 'id,name,state,primaryIp,ping',
                        sort: 'created',
                        validFields: 'ping,id,name,type,state,image,memory,disk,created,updated,primaryIp,firewall_enabled,package'
                    });
                }
                callback();
            }
        )
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
                e('Choose proto package: %s', pkg.name);
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
                'package': protoPkg.name
            };
            //e('proto createOpts', createOpts)
            smrt.createMachine(createOpts, function (err, initialMach) {
                if (err) {
                    e('Create proto machine "%s" (%s %s, %s) failed: %s',
                        protoName, protoImg.name, protoImg.version,
                        protoPkg.name, err);
                    proto.err = err;
                    return next();
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
            smrt.waitForMachineProvision(id, function (err, finalMach) {
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
                next();
            });
        },
        function prepSsh(next) {
            if (opts.existing_machine)
                return next();
            var prof = smrt.currProfile;
            protoSsh = 'ssh -q -o StrictHostKeyChecking=no '
                + '-o UserKnownHostsFile=/dev/null ';
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
        function customize(next) {
            if (opts.existing_machine)
                return next();
            // XXX START HERE: custom trojan script
            e('Customize the machine.')
            var cmd = protoSsh + " 'echo Hi there >> /etc/motd'";
            //e('customize cmd:', cmd)
            exec(cmd, function (err, stdout, stderr) {
                if (err) {
                    return next(new Error('error customizing proto machine:\n'
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
        function prepare(next) {
            if (opts.existing_machine)
                return next();
            e('Prepare the machine for imaging and shut it down.')
            var cmd;
            if (protoImg.os === 'smartos') {
                cmd = protoSsh + " 'sm-prepare-image -y'";
            } else if (protoImg.os === 'linux') {
                cmd = protoSsh + " 'cd /var/tmp && wget https://download.joyent.com/pub/prepare-image/linux-prepare-image && bash linux-prepare-image'";
            } else {
                return next(new Error(format(
                    'do not support prepare-image for os "%s"', protoImg.os)));
            }
            //e('prepare cmd:', cmd)
            exec(cmd, function (err, stdout, stderr) {
                if (err) {
                    return next(new Error('error preparing proto machine:\n'
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
                    img = {err: err};
                    return next();
                }
                e('Creating image %s (version %s): id %s',
                    createOpts.name, createOpts.version, initialImg.id);
                img = initialImg;
                next();
            });
        },
        function waitForImageCreate(next) {
            if (!img.id) {
                return next();
            }
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
    ], function (err) {
        if (proto && !opts.existing_machine) {
            smrt.deleteMachine(proto.id, function (delErr) {
                if (delErr) {
                    console.warn('smrt trojan: warning: error deleting proto '
                        + 'machine %s: %s', proto.id, delErr);
                }
                callback(err);
            })
        } else {
            callback(err);
        }
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



//---- exports

module.exports = CLI;
