'use strict';
var debug = require('debug')('revvedfinder');
var path = require('path');

// Allow to find, on disk, the revved version of a furnished file
//
// +locator+ : this is either:
//    - a hash mapping files with their revved versions
//    - a function that will return a list of file matching a given pattern (for example grunt.file.expand)
//
var RevvedFinder = module.exports = function (locator) {
  if (typeof(locator) === 'function') {
    this.expandfn = locator;
  } else {
    this.mapping = locator;
  }
};

var regexpQuote = function (str) {
  return (str + '').replace(/([.?*+\^$\[\]\\(){}|\-])/g, '\\$1');
};

RevvedFinder.prototype.getCandidatesFromMapping = function(file, searchPaths) {
  var dirname = path.dirname(file);
  var candidates = [];
  var self = this;

  searchPaths.forEach(function(sp) {
    var key = path.normalize(path.join(sp, file));
    debug('Looking at mapping for %s (from %s/%s)',key, sp, file);

    if (self.mapping[key]) {
      // We need to transform the actual file to a form that matches the one we received
      // For example if we received file 'foo/images/test.png' with searchPaths == ['dist'],
      // and found in mapping that 'dist/foo/images/test.png' has been renamed
      // 'dist/foo/images/1234.test.png' by grunt-rev, then we need to return
      // 'foo/images/1234.test.png'
      var cfile = path.basename(self.mapping[key]);
      candidates.push(dirname + '/' + cfile);
      debug('Found a candidate: %s/%s',dirname, cfile);
    }
  });

  return candidates;
}
;
RevvedFinder.prototype.getCandidatesFromFS = function(file, searchPaths) {
  var basename = path.basename(file);
  var dirname = path.dirname(file);
  var revvedRx = new RegExp('[0-9a-fA-F]+\\.' + regexpQuote(basename) + '$');
  var candidates = [];
  var self = this;

  searchPaths.forEach(function(sp) {
    var searchString = path.join(sp, dirname, '*.' + basename);
    debug('Looking for %s on disk', searchString);

    var files = self.expandfn(searchString);

    debug('Found ', files);

    // Keep only files that looks like revved file
    var goodFiles = files.filter(function(f) { return f.match(revvedRx); });

    // We now must remove the search path from the beginning, and add them to the
    // list of candidates
    goodFiles.forEach(function(gf) {
      var goodFileName = path.basename(gf);
      if (!file.match(/\//)) {
        // We only get a file (i.e. no dirs), so let's send back
        // what we found
        debug('Adding %s to candidates', goodFileName);
        candidates.push(goodFileName);
      } else {
        debug('Adding %s / %s to candidates', dirname, goodFileName);
        candidates.push(dirname + '/' + goodFileName);
      }
    });
  });

  return(candidates);
};


// Finds out candidates for file in the furnished searchPaths.
// It should return an array of candidates that are in the same format as the
// furnished file.
// For example, when given file 'images/test.png', and searchPaths of ['dist']
// the returned array should be something like ['images/1234.test.png']
//
RevvedFinder.prototype.getRevvedCandidates = function(file, searchPaths) {
  var candidates;

  // Our strategy depends on what we get at creation time: either a mapping, and we "just"
  // need to do look-up in the mapping, or an expand function and we need to find relevant files
  // on the disk
  // FIXME:

  if (this.mapping) {
    debug('Looking at mapping');
    candidates = this.getCandidatesFromMapping(file, searchPaths);
  }  else {
    debug('Looking on disk');
    candidates = this.getCandidatesFromFS(file, searchPaths);
  }

  return candidates;
};

//
// Find a revved version of +ofile+ (i.e. a file which name is ending with +ofile+), relatively
// to the furnished +searchDirs+.
// Let's imagine you have the following directory structure:
//  + build
//  |  |
//  |  +- css
//  |      |
//  |      + style.css
//  + images
//     |
//     + 2123.pic.png
//
// and that somehow style.css is referencing '../../images/pic.png'
// When called like that:
//   revvedFinder.find('../../images/pic.png', 'build/css');
// the function must return
// '../../images/2123.pic.png'
//
// Note that +ofile+ should be a relative path to the looked for file
// (i.e. if it's an absolue path -- starting with / -- or an external one -- containing :// -- then
//  the original file is returned)
//
// It returns an object with 2 attributes:
//  name: which is the filename
//  base: which is the directory from searchDirs where we found the file
//
RevvedFinder.prototype.find = function find(ofile, searchDirs) {
    var file = ofile;
    var searchPaths = searchDirs;
    var absolute;
    var prefix;

    if (typeof searchDirs  === 'string' || searchDirs instanceof String) {
      searchPaths = [searchDirs];
    }

    debug('Looking for revved version of %s in ', ofile, searchPaths);

    //do not touch external files or the root
    // FIXME: Should get only relative files
    if (ofile.match(/:\/\//) || ofile === '') {
      return ofile;
    }

    if (file[0] === '/') {
      // We need to remember this is an absolute file, but transform it
      // to a relative one
      absolute = true;
      file = file.replace(/^(\/+)/, function(match, header) { prefix = header; return '';});
    }

    var filepaths = this.getRevvedCandidates(file, searchPaths);

    var filepath = filepaths[0];
    debug('filepath is now ', filepath);

    // not a file in temp, skip it
    if (!filepath) {
      return ofile;
    }

    // var filename = path.basename(filepath);
    // handle the relative prefix (with always unix like path even on win32)
    // if (dirname !== '.') {
    //   filename = [dirname, filename].join('/');
    // }

    if (absolute) {
      filepath = prefix + filepath;
    }

    debug('Let\'s return %s', filepath);
    return filepath;
  };
