/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Core SMRT class.
 */

var p = console.log;
var path = require('path');
var fs = require('fs');

var assert = require('assert-plus');

var common = require('./common');



//---- SMRT class

function SMRT() {
    this.config = common.loadConfigSync();
    this.profiles = this.config.profiles || [];
    this.currProfile = this.config.currProfile;
}

SMRT.prototype.setCurrProfile = function setCurrProfile(name, callback) {
    if (!this.getProfile(name)) {
        return callback(new Error('no such profile: ' + name));
    }
    this.currProfile = this.config.currProfile = name;
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
    if (this.currProfile === name) {
        this.currProfile = null;
        this.config.currProfile = null;
    }
    common.saveConfigSync(this.config);
    callback();
};



//---- exports

module.exports = SMRT;
