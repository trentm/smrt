/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Core SMRT class.
 */

var p = console.log;
var path = require('path');
var fs = require('fs');

var assert = require('assert-plus');
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
            self._cloudapi = smartdc.createClient({
                url: prof.url,
                account: prof.account,
                version: '*',
                noCache: true,
                sign: smartdc.cliSigner({keyId: prof.key, user: prof.account})
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

SMRT.prototype._getImages = function _getImages(callback) {
    var self = this;
    if (!self._images) {
        var account = self.currProfile.account;
        self.cloudapi.listImages(account, function (err, images) {
            if (err) {
                return callback(err);
            }
            self._images = images;
            callback(null, images);
        });
    } else {
        callback(null, self._images);
    }
};

SMRT.prototype.randomImage = function randomImage(callback) {
    this._getImages(function (err, images) {
        //XXX exclude windows images optionally
        var i = common.randInt(0, images.length - 1);
        callback(null, images[i]);
    });
};

SMRT.prototype._getPackages = function _getPackages(callback) {
    var self = this;
    if (!self._packages) {
        var account = self.currProfile.account;
        self.cloudapi.listPackages(account, function (err, packages) {
            if (err) {
                return callback(err);
            }
            self._packages = packages;
            callback(null, packages);
        });
    } else {
        callback(null, self._packages);
    }
};

SMRT.prototype.randomPackage = function randomPackage(img, callback) {
    this._getPackages(function (err, packages) {
        //XXX filter packages suitable for image
        var i = common.randInt(0, packages.length - 1);
        callback(null, packages[i]);
    });
};

SMRT.prototype.randomNameSync = function randomNameSync(type) {
    var names = iliad[type];
    var i = common.randInt(0, names.length - 1);
    return names[i];
};




//---- exports

module.exports = SMRT;
