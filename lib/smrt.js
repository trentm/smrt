/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Core SMRT class.
 */

var format = require('util').format;
var fs = require('fs');
var p = console.log;
var path = require('path');

var assert = require('assert-plus');
var async = require('async');
var smartdc = require('smartdc');
var restify = require('restify');

var common = require('./common');
var iliad = require('../etc/iliad.json');



//---- SMRT class

/**
 * Create a SMRT.
 *
 * @param options {Object}
 *      - log {Bunyan Logger}
 *      - profile {String} Optional. Name of profile to use. Defaults to
 *        'defaultProfile' in the config.
 */
function SMRT(options) {
    assert.object(options, 'options');
    assert.object(options.log, 'options.log');
    assert.optionalString(options.profile, 'options.profile');
    var self = this;

    this.config = common.loadConfigSync();
    if (!this.config.profiles) {
        this.config.profiles = [];
    }
    this.profiles = this.config.profiles;
    this.defaultProfileName = this.config.defaultProfile;
    this.profile = this.getProfile(
        options.profile || this.config.defaultProfile);

    // Until we have a smartdc using restify with mcavage/node-restify#498
    // we need client_res and client_req serializers.
    this.log = options.log.child({
        profile: this.profile.name,
        serializers: restify.bunyan.serializers
    });
    this.log.trace({profile: this.profile}, 'profile data');

    this.__defineGetter__('cloudapi', function () {
        if (self._cloudapi === undefined) {
            var prof = self.profile;
            var sign;
            if (prof.privKey) {
                sign = smartdc.privateKeySigner({
                    user: prof.account,
                    keyId: prof.keyId,
                    key: prof.privKey
                });
            } else {
                sign = smartdc.cliSigner({keyId: prof.keyId, user: prof.account});
            }
            self._cloudapi = smartdc.createClient({
                url: prof.url,
                account: prof.account,
                version: '*',
                noCache: true,
                rejectUnauthorized: Boolean(prof.rejectUnauthorized),
                sign: sign,
                // cloudapi.js stupidly uses its own logger, but takes logLevel
                logLevel: this.log && this.log.level(),
                // Pass our logger to underlying restify client.
                log: this.log
            });
        }
        return self._cloudapi;
    });
}

SMRT.prototype.setDefaultProfile = function setDefaultProfile(name, callback) {
    if (!this.getProfile(name)) {
        return callback(new Error('no such profile: ' + name));
    }
    this.defaultProfileName = this.config.defaultProfile = name;
    common.saveConfigSync(this.config);
    callback();
};

SMRT.prototype.getProfile = function getProfile(name) {
    for (var i = 0; i < this.profiles.length; i++) {
        if (this.profiles[i].name === name) {
            return this.profiles[i];
        }
    }
};

/**
 * Create or update a smrt profile.
 *
 * @param profile {Object}
 * @param options {Object}
 *      - setDefault {Boolean}
 * @param callback {Function} `function (err)`
 */
SMRT.prototype.createOrUpdateProfile = function createOrUpdateProfile(
        profile, options, callback) {
    assert.object(profile, 'profile');
    if (typeof(options) === 'function') {
        callback = options;
        options = {};
    }
    assert.object(options, 'options')
    assert.optionalBool(options.setDefault, 'options.setDefault')
    assert.func(callback, 'callback')

    var found = false;
    for (var i = 0; i < this.profiles.length; i++) {
        if (this.profiles[i].name === profile.name) {
            this.profiles[i] = profile;
            found = true;
        }
    }
    if (!found) {
        this.profiles.push(profile);
    }
    if (options.setDefault) {
        this.defaultProfileName = this.config.defaultProfile = profile.name;
    }
    common.saveConfigSync(this.config);
    callback();
};

SMRT.prototype.deleteProfile = function deleteProfile(name, callback) {
    var found = false;
    for (var i = 0; i < this.profiles.length; i++) {
        if (this.profiles[i].name === name) {
            found = true;
            this.profiles.splice(i, 1);
        }
    }
    if (!found) {
        return callback(new Error('no such profile: ' + name));
    }
    if (this.defaultProfileName === name) {
        this.defaultProfileName = this.config.defaultProfile = null;
    }
    common.saveConfigSync(this.config);
    callback();
};

SMRT.prototype.listHomericMachines = function listHomericMachines(callback) {
    // Due to OS-2508 and AGENT-663, can't rely on tags for this:
    //    var listOpts = {
    //        'tag.homeric': true
    //    };
    //    this.cloudapi.listMachines(listOpts, function (err, machines) {
    //        if (err) return callback(err);
    //        callback(null, machines);
    //    });

    // ... so instead we'll use the name pattern.
    this.cloudapi.listMachines({}, function (err, machines) {
        if (err)
            return callback(err);
        var hMachines = [];
        var namePat = /^(\w+)-(\w+)-(i|\d+)$/;
        for (var i = 0; i < machines.length; i++) {
            var m = machines[i];
            if (m.tags.homeric) {
                hMachines.push(m);
                continue;
            }
            var match = namePat.exec(m.name);
            if (match && iliad.greeks[m.name.split('-', 1)[0]]) {
                hMachines.push(m);
            }
            //p('not homeric: machine', m.id, m.name);
        }
        callback(null, hMachines);
    });
};


SMRT.prototype.listMachines = function listMachines(callback) {
    this.cloudapi.listMachines({}, callback);
};

SMRT.prototype.getMachine = function getMachine(id, callback) {
    this.cloudapi.getMachine(id, callback);
};

SMRT.prototype.getMachineMetadata = function getMachineMetadata(id, callback) {
    this.cloudapi.getMachineMetadata(id, callback);
};

SMRT.prototype.updateMachineMetadata = function updateMachineMetadata(id, metadata, callback) {
    this.cloudapi.updateMachineMetadata(id, metadata, callback);
};


SMRT.prototype.listMachineSnapshots = function listMachineSnapshots(
        machineId, callback) {
    this.cloudapi.listMachineSnapshots(machineId, callback);
};

SMRT.prototype.getMachineAudit = function getMachineAudit(
        machineId, callback) {
    this.cloudapi.getMachineAudit(machineId, callback);
};

SMRT.prototype.getImage = function getImage(
        imageId, callback) {
    this.cloudapi.getImage(imageId, callback);
};



SMRT.prototype.listImages = function listImages(callback) {
    var self = this;
    if (!self._images) {
        self.cloudapi.listImages(function (err, images) {
            if (err) {
                return callback(err);
            }
            self._images = images;
            callback(null, images);
        });
    } else {
        callback(null, common.deepObjCopy(self._images));
    }
};

SMRT.prototype.getImage = function getImage(id, callback) {
    this.cloudapi.getImage(id, callback);
};

SMRT.prototype.deleteImage = function deleteImage(id, callback) {
    this.cloudapi.deleteImage(id, callback);
};


SMRT.prototype.listHomericImages = function listHomericImages(callback) {
    // If/until ListImages supports filtering on tags, we'll filter client-side.
    this.listImages(function (err, images) {
        if (err) {
            return callback(err);
        }
        var homericImages = images.filter(function (img) {
            return (img.tags && (img.tags.homeric === true
                /* This 'true' *string* is a bug... to be filed. */
                || img.tags.homeric === 'true'));
        });
        callback(null, homericImages);
    })
};

SMRT.prototype.randomImage = function randomImage(term, callback) {
    assert.optionalString(term, 'term');
    assert.func(callback, 'callback');

    //XXX Use getImage if the 'term' is a UUID. To try to workaround PUBAPI-821
    //var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    //if (UUID_RE.test(term)) {
    //    this.getImage(term, callback);
    //}
    //else

    this.listImages(function (err, images) {
        if (err) {
            return callback(err);
        }

        var suitableImages = images.filter(function (img) {
            // Limitation: Exclude windows images for now.
            if (img.os === 'windows') {
                return false;
            }
            // Skip core images.
            if (img.tags
                && (img.tags.smartdc_service === "true"
                    || img.tags.smartdc_service === true))
            {
                return false;
            }
            // Skip 'manta-build' (huge) for now.
            if (img.name === 'manta-build') {
                return false;
            }
            return true;
        });
        if (suitableImages.length === 0) {
            return callback(new Error('no suitable images found'));
        }

        // Filter if `term` is given.
        var i;
        if (term) {
            // - First look for exact matches.
            var exactMatches = suitableImages.filter(function (img) {
                return (term === img.id || term === img.name);
            });
            if (exactMatches.length) {
                i = common.randInt(0, exactMatches.length - 1);
                return callback(null, exactMatches[i]);
            }
            // - Next try id prefix.
            var prefixMatches = suitableImages.filter(function (img) {
                return img.id.indexOf(term) === 0;
            });
            if (prefixMatches.length) {
                i = common.randInt(0, prefixMatches.length - 1);
                return callback(null, prefixMatches[i]);
            }
            // - Next try substring matches (case-insensitive).
            var termLower = term.toLowerCase();
            var partialMatches = suitableImages.filter(function (img) {
                return ~img.name.toLowerCase().indexOf(termLower);
            });
            if (partialMatches.length) {
                i = common.randInt(0, partialMatches.length - 1);
                return callback(null, partialMatches[i]);
            }
            return callback(new Error(format(
                'no suitable images matching "%s"', term)));
        }

        i = common.randInt(0, suitableImages.length - 1);
        callback(null, suitableImages[i]);
    });
};

/**
 * Return the latest image (by published_at) matching the given term.
 *
 * @param term {String} A image id, name, id prefix, name substring.
 * @param callback {Function} `function (err, image)`
 */
SMRT.prototype.latestImage = function randomImage(term, callback) {
    this.listImages(function (err, images) {
        if (err) {
            return callback(err);
        }
        var suitableImages = images.filter(function (img) {
            // Limitation: Exclude windows images for now.
            if (img.os === 'windows') {
                return false;
            }
            // Skip core images.
            if (img.tags
                && (img.tags.smartdc_service === "true"
                    || img.tags.smartdc_service === true))
            {
                return false;
            }
            return true;
        });
        // id
        for (var i = 0; i < suitableImages.length; i++) {
            if (suitableImages[i].id === term) {
                return callback(null, suitableImages[i]);
            }
        }
        // name
        var nameImages = images.filter(
            function (img) { return (img.name === term); });
        if (nameImages.length > 0) {
            nameImages.sort(function (a, b) {
                var A = a.published_at;
                var B = b.published_at;
                return ((A < B) ? -1 : ((A > B) ? 1 : 0));
            });
            return callback(null, nameImages.slice(-1)[0]);
        }
        // id prefix
        var idPrefixImages = images.filter(
            function (img) { return img.id.indexOf(term) === 0; });
        if (idPrefixImages.length > 0) {
            idPrefixImages.sort(function (a, b) {
                var A = a.published_at;
                var B = b.published_at;
                return ((A < B) ? -1 : ((A > B) ? 1 : 0));
            });
            return callback(null, idPrefixImages.slice(-1)[0]);
        }
        // name substr
        var nameSubstrImages = images.filter(
            function (img) { return ~img.name.indexOf(term); });
        if (nameSubstrImages.length > 0) {
            nameSubstrImages.sort(function (a, b) {
                var A = a.published_at;
                var B = b.published_at;
                return ((A < B) ? -1 : ((A > B) ? 1 : 0));
            });
            return callback(null, nameSubstrImages.slice(-1)[0]);
        }

        callback(new Error(format('no images matching "%s"', term)));
    });
};


SMRT.prototype.listNetworks = function listNetworks(callback) {
    var self = this;
    if (!self._networks) {
        self.cloudapi.listNetworks(function (err, networks) {
            if (err) {
                return callback(err);
            }
            self._networks = networks;
            callback(null, networks);
        });
    } else {
        callback(null, common.deepObjCopy(self._networks));
    }
};

/**
 * Find random networks matching the given terms. If there are no 'terms', then
 * return undefined -- which is what CreateMachine takes for the 'networks'
 * arg to mean "use the default network".
 */
SMRT.prototype.randomNetworks = function randomNetworks(
        profile, terms, callback) {
    assert.object(profile, 'profile');
    assert.optionalArrayOfString(terms, 'terms');
    assert.func(callback, 'callback');

    if (!terms || terms.length === 0) {
        return callback(null, undefined);
    }

    this.listNetworks(function (err, allNetworks) {
        if (err) {
            return callback(err);
        } else if (allNetworks.length === 0) {
            return callback(new Error('no networks found'));
        }

        var nets = [];
        for (var i = 0; i < terms.length; i++) {
            var term = terms[i];

            // If an explicit UUID is passed in, just use that without validating
            // that it is "suitable".
            var found = false;
            for (var i = 0; i < allNetworks.length; i++) {
                if (term === allNetworks[i].id) {
                    found = true;
                    nets.push(allNetworks[i]);
                    continue;
                }
            }
            if (found) {
                continue;
            }

            var i;
            // - First look for exact matches.
            var exactMatches = allNetworks.filter(function (net) {
                return (term === net.id || term === net.name);
            });
            if (exactMatches.length) {
                i = common.randInt(0, exactMatches.length - 1);
                nets.push(exactMatches[i]);
                continue;
            }
            // - Next try substring matches (case-insensitive).
            var termLower = term.toLowerCase();
            var partialMatches = suitableNetworks.filter(function (net) {
                return ~net.name.toLowerCase().indexOf(termLower);
            });
            if (partialMatches.length) {
                i = common.randInt(0, partialMatches.length - 1);
                nets.push(partialMatches[i]);
                continue;
            }
            return callback(new Error(format(
                'no networks matching "%s"', term)));
        }

        callback(null, nets);
    });
};

SMRT.prototype.listPackages = function listPackages(callback) {
    var self = this;
    if (!self._packages) {
        self.cloudapi.listPackages(function (err, packages) {
            if (err) {
                return callback(err);
            }
            self._packages = packages;
            callback(null, packages);
        });
    } else {
        callback(null, common.deepObjCopy(self._packages));
    }
};

SMRT.prototype.randomPackage = function randomPackage(
        profile, img, term, callback) {
    assert.object(profile, 'profile');
    assert.object(img, 'img');
    assert.optionalString(term, 'term');
    assert.func(callback, 'callback');

    // `min_ram/max_ram` on images are in MiB.
    // `memory` on packages are in MiB (yeah for accidental consistency!)
    var min_ram = img.requirements && img.requirements.min_ram;
    var max_ram = img.requirements && img.requirements.max_ram;
    this.listPackages(function (err, packages) {
        if (err) {
            return callback(err);
        }

        // If an explicit UUID is passed in, just use that without validating
        // that it is "suitable".
        for (var i = 0; i < packages.length; i++) {
            if (term === packages[i].id) {
                return callback(null, packages[i]);
            }
        }

        var suitablePackages = packages.filter(function (pkg) {
            // A smrt profile can define a max ram.
            if (profile.maxRam && pkg.memory > profile.maxRam) {
                return false;
            }
            // Handle min_ram/max_ram on images.
            if (min_ram && pkg.memory < min_ram) {
                return false;
            }
            if (max_ram && pkg.memory > max_ram) {
                return false;
            }
            // Exclude '*-image-creation' packages -- interim packages intended
            // just for VMs to be used for image creation.
            if (/-image-creation$/.test(pkg.name)) {
                return false;
            }
            // The g3-* packages separate on '-smartos' and '-kvm' (which
            // IMO is a little bit weird). Exclude the appropriate ones.
            if (img.os === 'smartos') {
                if (/^g3-.*-kvm/.test(pkg.name)) {
                    return false;
                }
            } else {
                if (/^g3-.*-smartos/.test(pkg.name)) {
                    return false;
                }
            }
            return true;
        });
        if (suitablePackages.length === 0) {
            return callback(new Error('no suitable packages found'));
        }

        // Filter if `term` is given.
        var i;
        if (term) {
            // - First look for exact matches.
            var exactMatches = suitablePackages.filter(function (pkg) {
                return (term === pkg.id || term === pkg.name);
            });
            if (exactMatches.length) {
                i = common.randInt(0, exactMatches.length - 1);
                return callback(null, exactMatches[i]);
            }
            // - Next try substring matches (case-insensitive).
            var termLower = term.toLowerCase();
            var partialMatches = suitablePackages.filter(function (pkg) {
                return ~pkg.name.toLowerCase().indexOf(termLower);
            });
            if (partialMatches.length) {
                i = common.randInt(0, partialMatches.length - 1);
                return callback(null, partialMatches[i]);
            }
            return callback(new Error(format(
                'no suitable packages matching "%s"', term)));
        }

        var i = common.randInt(0, suitablePackages.length - 1);
        callback(null, suitablePackages[i]);
    });
};

SMRT.prototype.getImageCreationPackage
        = function getImageCreationPackage(img, callback) {
    // `min_ram/max_ram` on images are in MiB.
    // `memory` on packages are in MiB (yeah for accidental consistency!)
    var min_ram = img.requirements && img.requirements.min_ram;
    var max_ram = img.requirements && img.requirements.max_ram;
    this.listPackages(function (err, packages) {
        if (err) {
            return callback(err);
        }
        var suitablePackages = packages.filter(function (pkg) {
            // TODO: handle min_ram/max_ram on images.
            if (min_ram && pkg.memory < min_ram) {
                return false;
            }
            if (max_ram && pkg.memory > max_ram) {
                return false;
            }
            // Include only '*-image-creation' packages -- interim packages
            // intended just for VMs to be used for image creation.
            if (! /-image-creation$/.test(pkg.name)) {
                return false;
            }
            // The g3-* packages separate on '-smartos' and '-kvm' (which
            // IMO is a little bit weird). Exclude the appropriate ones.
            if (img.os === 'smartos') {
                if (/^g3-.*-kvm/.test(pkg.name)) {
                    return false;
                }
            } else {
                if (/^g3-.*-smartos/.test(pkg.name)) {
                    return false;
                }
            }
            return true;
        });
        if (suitablePackages.length === 0) {
            return callback(new Error('no suitable packages found'));
        }
        var i = common.randInt(0, suitablePackages.length - 1);
        callback(null, suitablePackages[i]);
    });
};

SMRT.prototype.randomNameSync = function randomNameSync(type) {
    var names = Object.keys(iliad[type]);
    var i = common.randInt(0, names.length - 1);
    return names[i];
};

SMRT.prototype.createMachine = function createMachine(createOpts, callback) {
    assert.object(createOpts, 'createOpts');
    assert.func(callback, 'callback');

    this.log.info({createOpts: createOpts}, 'createMachine');
    this.cloudapi.createMachine(createOpts, function (err, machine) {
        if (err) {
            return callback(err);
        }
        callback(null, machine);
    });
};

SMRT.prototype.createImageFromMachine = function createImageFromMachine(
        createOpts, callback) {
    assert.object(createOpts, 'createOpts');
    assert.func(callback, 'callback');
    var self = this;

    self.cloudapi.createImageFromMachine(createOpts, function (err, img) {
        if (err) {
            return callback(err);
        }
        self._images = null;
        callback(null, img);
    });
};

/**
 * Wait for the given machine to provision (or fail).
 *
 * @param options {Object}
 *      - @param id {UUID} Id of the machine.
 *      - @param interval {Number} Number of milliseconds polling interval.
 * @param callback {Function} `function (err, machine)`
 */
SMRT.prototype.waitForMachineProvision = function waitForMachineProvision(
        options, callback) {
    var self = this;
    assert.object(options, 'options');
    assert.string(options.id, 'options.id');
    assert.optionalNumber(options.interval, 'options.interval');
    assert.func(callback, 'callback');
    var interval = (options.interval === undefined ? 1000 : options.interval);

    setTimeout(poll, interval);

    function poll() {
        self.cloudapi.getMachine(options.id, function (err, mach) {
            if (err) {
                return callback(err);
            }
            if (mach.state !== 'provisioning') {
                return callback(null, mach);
            }
            setTimeout(poll, interval);
        });
    }
};


/**
 * Wait for the given image id to finish being created. IOW, wait for the state
 * to go to 'active' or 'failed'.
 *
 * @param id {UUID} Id of the image.
 * @param options {Object} Optional
 *      - @param timeout {Number} Number of milliseconds after which to error out.
 *        Default is no timeout.
 *      - @param interval {Number} Polling interval in milliseconds.
 *        Default is 10000 (i.e. 10s).
 * @param callback {Function} `function (err, image)`
 */
SMRT.prototype.waitForImageCreate = function waitForImageCreate(
        id, options, callback) {
    if (typeof(options) === 'function') {
        callback = options;
        options = {};
    }
    assert.string(id, 'id');
    assert.object(options, 'options');
    assert.optionalNumber(options.timeout, 'options.timeout');
    assert.optionalNumber(options.interval, 'options.interval');
    assert.func(callback, 'callback');
    var self = this;
    var timeout = options.timeout || false;
    var interval = options.interval || 10000;

    var start = Date.now();
    setTimeout(poll, 1000);

    function poll() {
        self.cloudapi.getImage(id, function (err, img) {
            if (err) {
                return callback(err);
            }
            if (img.state === 'active' || img.state === 'failed') {
                return callback(null, img);
            }
            if (timeout && Date.now() - start > timeout * 1000) {
                return callback(new Error(format(
                    'timeout (>%ds) waiting for image %s to create',
                    timeout, id)))
            }
            setTimeout(poll, interval);
        });
    }
};


/**
 * Wait for the given machine to stop.
 *
 * @param id {UUID} Id of the machine.
 * @param timeout {Number} Number of seconds after which to error out.
 * @param callback {Function} `function (err, machine)`
 */
SMRT.prototype.waitForMachineStop = function waitForMachineStop(
        id, timeout, callback) {
    var self = this;
    assert.string(id, 'id');
    assert.number(timeout, 'timeout');
    assert.func(callback, 'callback');

    var start = Date.now();
    setTimeout(poll, 1000);

    function poll() {
        self.cloudapi.getMachine(id, function (err, mach) {
            if (err) {
                return callback(err);
            }
            if (mach.state === 'stopped') {
                return callback(null, mach);
            }
            if (Date.now() - start > timeout * 1000) {
                return callback(new Error(format(
                    'timeout (>%ds) waiting for machine %s to stop',
                    timeout, id)))
            }
            setTimeout(poll, 1000);
        });
    }
};


SMRT.prototype.deleteMachine = function deleteMachine(id, callback) {
    this.cloudapi.deleteMachine(id, callback);
};

SMRT.prototype.stopMachine = function stopMachine(id, callback) {
    this.cloudapi.stopMachine(id, callback);
};

SMRT.prototype.rebootMachine = function rebootMachine(id, callback) {
    this.cloudapi.rebootMachine(id, callback);
};

SMRT.prototype.deleteImage = function deleteImage(id, callback) {
    this.cloudapi.deleteImage(id, callback);
};



//---- exports

module.exports = SMRT;
