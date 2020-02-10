var coffeescript = require('coffee-script');
var path = require('path');
var fs = require('fs');
var calculate = require('sse4_crc32').calculate;
var mkdirp = require('mkdirp');
var getDirName = path.dirname;

var devFlag = false;
var cacheDirPath = process.cwd() + '/.cache';
var oldCacheIndex = {};
var freshCacheIndex = {};
var cacheIndexPath = cacheDirPath + '/_cacheIndex';

function writeFile(path, contents, cb) {
    /*
        Create:
        - whole path for the file
        - write file
    */
    mkdirp(getDirName(path), function(err) {
        if (err) return cb(err);
        fs.writeFileSync(path, contents, cb);
    });
}

try {
    oldCacheIndex = JSON.parse(fs.readFileSync(cacheIndexPath, 'utf8'));
} catch (err) {
    console.log('Cache index-file not found.');
}

module.exports = function(builder) {
    builder.hook('before scripts', function(pkg, next) {
        var options = {
            bare: true
        };

        if (pkg.dev) {
            //For some reason dev-settings are not applied to all files.
            devFlag = true;
        }
        if (devFlag === true) {
            pkg.dev = devFlag;
            options.sourceMap = false;
        }

        // No scripts field in the component.json file
        if (pkg.config.scripts === undefined) return next();

        // Get all the coffee files from the scripts list
        var coffee = pkg.config.scripts.filter(function(file) {
            return path.extname(file) === '.coffee';
        });

        // No scripts
        var cacheHasChanged = false;

        if (coffee.length === 0) return next();
        coffee.forEach(function(file, i) {
            options.filename = pkg.path(file);

            var str = fs.readFileSync(options.filename, 'utf8');
            var hash = calculate(str);
            var compiled = oldCacheIndex[hash];
            if (undefined === compiled) {
                cacheHasChanged = true;
                console.log('Compiling: ', options.filename);
                compiled = coffeescript.compile(str, options);
                if (compiled.v3SourceMap) {
                    compiled = compiled.js;
                }
            }
            freshCacheIndex[hash] = compiled;

            pkg.removeFile('scripts', file);
            pkg.addFile('scripts', file, compiled);
            // This duplicates the code in the built package, but needed to be able to require
            // modules without adding .coffee - a better solution is needed for production:
            pkg.addFile('scripts', file.replace('.coffee', '.js'), compiled);

        });
        next();
        if (cacheHasChanged) {
            // Writes cache only when there are real changes.
            writeFile(cacheIndexPath, JSON.stringify(freshCacheIndex), 'utf8');
        }
    });
};
