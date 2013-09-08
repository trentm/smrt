/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Core SMRT class.
 */

var p = console.log;
var path = require('path');
var fs = require('fs');

var assert = require('assert-plus');
var async = require('async');
var smartdc = require('smartdc');

var common = require('./common');
var iliad = require('../etc/iliad.json');



//---- SMRT class

function SMRT() {
    var self = this;
    this.config = common.loadConfigSync();
    this.profiles = this.config.profiles || [];
    this.currProfileName = this.config.currProfile;

    this.__defineGetter__('currProfile', function () {
        if (self.currProfileName) {
            return self.getProfile(self.currProfileName);
        }
    });

    this.__defineGetter__('cloudapi', function () {
        if (self._cloudapi === undefined) {
            var prof = self.currProfile;
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
                sign: sign
            });
        }
        return self._cloudapi;
    });
}

SMRT.prototype.setCurrProfile = function setCurrProfile(name, callback) {
    if (!this.getProfile(name)) {
        return callback(new Error('no such profile: ' + name));
    }
    this.currProfileName = this.config.currProfile = name;
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
 *      - setCurrent {Boolean}
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
    assert.optionalBool(options.setCurrent, 'options.setCurrent')
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
    if (options.setCurrent) {
        this.currProfileName = this.config.currProfile = profile.name;
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
    if (this.currProfileName === name) {
        this.currProfileName = this.config.currProfile = null;
    }
    common.saveConfigSync(this.config);
    callback();
};

SMRT.prototype.listHomericMachines = function listHomericMachines(callback) {
    var listOpts = {
        'tag.homeric': true
    };
    this.cloudapi.listMachines(listOpts, function (err, machines) {
        if (err) return callback(err);
        callback(null, machines);
    });
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

SMRT.prototype.listHomericImages = function listHomericImages(callback) {
    // If/until ListImages supports filtering on tags, we'll filter client-side.
    this.listImages(function (err, images) {
        if (err) {
            return callback(err);
        }
        var homericImages = images.filter(function (img) {
            return (img.tags && img.tags.homeric === true);
        });
        callback(null, homericImages);
    })
};

SMRT.prototype.randomImage = function randomImage(callback) {
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
        var i = common.randInt(0, suitableImages.length - 1);
        callback(null, suitableImages[i]);
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

SMRT.prototype.randomPackage = function randomPackage(img, callback) {
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
            // Exclude '*-image-creation' packages -- interim packages intended
            // just for VMs to be used for image creation.
            if (/-image-creation$/.test(pkg.name)) {
                return false;
            }
            // The g3-* packages separate on '-smartos' and '-kvm' (which
            // IMO is a little bit weird). Exclude the appropriate ones.
            if (img.os === 'smartos') {
                if (/^g3-.*-kvm$/.test(pkg.name)) {
                    return false;
                }
            } else {
                if (/^g3-.*-smartos/.test(pkg.name)) {
                    return false;
                }
            }
            return true;
        });
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

    var self = this;
    var account = self.currProfile.account;
    self.cloudapi.createMachine(createOpts, function (err, machine) {
        if (err) {
            return callback(err);
        }
        callback(null, machine);
    });
};

/**
 * Wait for the given machine to provision (or fail).
 *
 * @param id {UUID} Id of the machine.
 * @param callback {Function} `function (err, machine)`
 */
SMRT.prototype.waitForMachineProvision = function waitForMachineProvision(
        id, callback) {
    var self = this;
    assert.string(id, 'id');
    assert.func(callback, 'callback');
    var account = self.currProfile.account;

    function poll() {
        self.cloudapi.getMachine(id, function (err, mach) {
            if (err) {
                return callback(err);
            }
//console.log('XXX poll: %s %s', mach.name, mach.state);
            if (mach.state !== 'provisioning') {
                return callback(null, mach);
            }
            timeout = setTimeout(poll, 1000);
        });
    }

    var timeout = setTimeout(poll, 1000);
};


SMRT.prototype.deleteMachines = function deleteMachines(machineIds, callback) {
    var self = this;
    assert.arrayOfString(machineIds, 'machineIds');
    assert.func(callback, 'callback');
    async.each(
        machineIds,
        function deleteMachine(id, next) {
            self.cloudapi.deleteMachine(id, next);
        },
        callback);
};

SMRT.prototype.deleteImages = function deleteImages(imageIds, callback) {
    var self = this;
    assert.arrayOfString(imageIds, 'imageIds');
    assert.func(callback, 'callback');
    async.each(
        imageIds,
        function deleteImage(id, next) {
            self.cloudapi.deleteImage(id, next);
        },
        callback);
};



//---- exports

module.exports = SMRT;
