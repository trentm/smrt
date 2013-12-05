/*
 * Copyright (c) 2013, Joyent, Inc. All rights reserved.
 *
 * Dump for shared stuff that doesn't fit in another source file.
 */

var p = console.log;
var path = require('path');
var fs = require('fs');
var format = require('util').format;

var assert = require('assert-plus');
var sprintf = require('extsprintf').sprintf;


CONFIG_PATH = path.join(process.env.HOME, ".smrtconfig.json")

function loadConfigSync() {
    if (fs.existsSync(CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } else {
        return {};
    }
}

function saveConfigSync(config) {
    fs.writeFileSync(
        CONFIG_PATH,
        JSON.stringify(config, null, 4),
        'utf8');
}


function randInt(min, max, skip) {
    var num = (Math.floor(Math.random() * (max - min + 1)) + min);
    if (num === skip)
        num = ((num + 1) % max);
    return num;
}

function objCopy(obj) {
    var copy = {};
    Object.keys(obj).forEach(function (k) {
        copy[k] = obj[k];
    });
    return copy;
}

function deepObjCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}


function indent(s, ind) {
    if (!ind) ind = '    ';
    var lines = s.split(/\r?\n/g);
    return ind + lines.join('\n' + ind);
}


/**
 * Print a table of the given items.
 *
 * @params items {Array}
 * @params options {Object}
 *      - `columns` {String} of comma-separated field names for columns
 *      - `skipHeader` {Boolean} Default false.
 *      - `sort` {String} of comma-separate fields on which to alphabetically
 *        sort the rows. Optional.
 *      - `validFields` {String} valid fields for `columns` and `sort`
 */
function tabulate(items, options) {
    assert.arrayOfObject(items, 'items');
    assert.object(options, 'options');
    assert.string(options.columns, 'options.columns');
    assert.optionalBool(options.skipHeader, 'options.skipHeader');
    assert.optionalString(options.sort, 'options.sort');
    assert.string(options.validFields, 'options.validFields');

    if (items.length === 0) {
        return;
    }

    // Validate.
    var validFields = options.validFields.split(',');
    var columns = options.columns.split(',');
    var sort = options.sort ? options.sort.split(',') : [];
    columns.forEach(function (c) {
        if (validFields.indexOf(c) === -1) {
            throw new TypeError(format('invalid output field: "%s"', c));
        }
    });
    sort.forEach(function (s) {
        if (validFields.indexOf(s) === -1) {
            throw new TypeError(format('invalid sort field: "%s"', s));
        }
    });

    // Determine columns and widths.
    var widths = {};
    columns.forEach(function (c) { widths[c] = c.length; });
    items.forEach(function (i) {
        columns.forEach(function (c) {
            widths[c] = Math.max(widths[c], (i[c] ? String(i[c]).length : 0));
        });
    });

    var template = '';
    columns.forEach(function (c) {
        template += '%-' + String(widths[c]) + 's  ';
    });
    template = template.trim();

    if (sort.length) {
        function cmp(a, b) {
          for (var i = 0; i < sort.length; i++) {
            var field = sort[i];
            var invert = false;
            if (field[0] === '-') {
                invert = true;
                field = field.slice(1);
            }
            assert.ok(field.length, 'zero-length sort field: ' + options.sort);
            var a_cmp = Number(a[field]);
            var b_cmp = Number(b[field]);
            if (isNaN(a_cmp) || isNaN(b_cmp)) {
                a_cmp = a[field];
                b_cmp = b[field];
            }
            if (a_cmp < b_cmp) {
                return (invert ? 1 : -1);
            } else if (a_cmp > b_cmp) {
                return (invert ? -1 : 1);
            }
          }
          return 0;
        }
        items.sort(cmp);
    }

    if (!options.skipHeader) {
        var header = columns.map(function (c) { return c.toUpperCase(); });
        header.unshift(template);
        console.log(sprintf.apply(null, header));
    }
    items.forEach(function (i) {
        var row = columns.map(function (c) {
            var cell = i[c];
            if (cell === null || cell === undefined) {
                return '-';
            } else {
                return String(i[c]);
            }
        });
        row.unshift(template);
        console.log(sprintf.apply(null, row));
    });
}


/**
 * Randomize array element order in-place.
 * Using Fisher-Yates shuffle algorithm.
 *
 * From http://stackoverflow.com/questions/2450954/how-to-randomize-a-javascript-array
 */
function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
}




//---- exports

module.exports = {
    loadConfigSync: loadConfigSync,
    saveConfigSync: saveConfigSync,
    randInt: randInt,
    objCopy: objCopy,
    deepObjCopy: deepObjCopy,
    indent: indent,
    tabulate: tabulate,
    shuffleArray: shuffleArray
};
