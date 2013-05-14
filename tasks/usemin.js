'use strict';
var util = require('util');

var inspect = function (obj) {
  return util.inspect(obj, false, 4, true);
};

// Retrieve the flow config from the furnished configuration. It can be:
//  - a dedicated one for the furnished target
//  - a general one
//  - the default one
var getFlowFromConfig = function(config,target) {
  var flow = { steps: ['concat', 'uglifyjs'], post: ['requirejs']};
  if (config.options && config.options.flow) {
    if (config.options.flow[target]) {
      flow.steps = config.options.flow[target].steps;
      flow.post = config.options.flow[target].post;
    } else {
      flow.steps = config.options.flow.steps;
      flow.post = config.options.flow.post;
    }
  }
  return flow;
};

//
// ### Usemin

// Replaces references to non-optimized scripts or stylesheets
// into a set of HTML files (or any templates/views).
//
// The users markup should be considered the primary source of information
// for paths, references to assets which should be optimized.We also check
// against files present in the relevant directory () (e.g checking against
// the revved filename into the 'temp/') directory to find the SHA
// that was generated.
//
// Todos:
// * Use a file dictionary during build process and rev task to
// store each optimized assets and their associated sha1.
//
// #### Usemin-handler
//
// A special task which uses the build block HTML comments in markup to
// get back the list of files to handle, and initialize the grunt configuration
// appropriately, and automatically.
//
// Custom HTML "block" comments are provided as an API for interacting with the
// build script. These comments adhere to the following pattern:
//
//     <!-- build:<type> <path> -->
//       ... HTML Markup, list of script / link tags.
//     <!-- endbuild -->
//
// - type: is either js or css.
// - path: is the file path of the optimized file, the target output.
//
// An example of this in completed form can be seen below:
//
//    <!-- build:js js/app.js -->
//      <script src="js/app.js"></script>
//      <script src="js/controllers/thing-controller.js"></script>
//      <script src="js/models/thing-model.js"></script>
//      <script src="js/views/thing-view.js"></script>
//    <!-- endbuild -->
//
//
// Internally, the task parses your HTML markup to find each of these blocks, and
// initializes for you the corresponding Grunt config for the concat / uglify tasks
// when `type=js`, the concat / cssmin tasks when `type=css`.
//
// The task also handles use of RequireJS, for the scenario where you specify
// the main entry point for your application using the "data-main" attribute
// as follows:
//
//     <!-- build:js js/app.min.js -->
//     <script data-main="js/main" src="js/vendor/require.js"></script>
//     <!-- -->
//
// One doesn't need to specify a concat/uglify/cssmin or requirejs configuration anymore.
//
// Inspired by previous work in https://gist.github.com/3024891
// For related sample, see: cli/test/tasks/usemin-handler/index.html
//

module.exports = function (grunt) {
  var FileProcessor = require('../lib/fileprocessor');
  var RevvedFinder = require('../lib/revvedfinder');
  var ConfigWriter = require('../lib/configwriter');
  var _ = grunt.util._;

  grunt.registerMultiTask('usemin', 'Replaces references to non-minified scripts / stylesheets', function () {
    var debug = require('debug')('usemin:usemin');
    var options = this.options({
      type: this.target
    });

    debug('Looking at %s target', this.target);
    var patterns;

    // Check if we have a user defined pattern
    if (options.patterns && options.patterns[this.target]) {
      debug('Using user defined pattern for %s',this.target);
      patterns = options.patterns[this.target];
    }
    else
    {
      debug('Using predefined pattern for %s',this.target);
      patterns = options.type;
    }

    var revvedfinder = new RevvedFinder(function (p) { return grunt.file.expand({filter: 'isFile'}, p); });
    var handler = new FileProcessor(patterns, revvedfinder, function (msg) { grunt.log.writeln(msg);});

    this.files.forEach(function (fileObj) {
      var files = grunt.file.expand({nonull: true}, fileObj.src);
      files.forEach(function (filename) {
        debug('looking at file %s', filename);

        grunt.log.subhead('Processing as ' + options.type.toUpperCase() + ' - ' + filename);

        // Our revved version locator
        var content = handler.process(filename, options.assetsDirs);

        // write the new content to disk
        grunt.file.write(filename, content);
      });
    });
  });

  grunt.registerMultiTask('useminPrepare', 'Using HTML markup as the primary source of information', function () {
    var options = this.options();
    // collect files
    var files = grunt.file.expand({filter: 'isFile'}, this.data);
    var dest = options.dest || 'dist';

    grunt.log
      .writeln('Going through ' + grunt.log.wordlist(files) + ' to update the config')
      .writeln('Looking for build script HTML comment blocks');

    var flow = getFlowFromConfig(grunt.config('useminPrepare'), this.target);

    var c = new ConfigWriter( flow.steps, flow.post, {input: 'app', dest: dest, staging: '.tmp'} );

    var cfgNames = [];
    c.steps.forEach(function(i) { cfgNames.push(i.name);});
    c.postprocessors.forEach(function(i) { cfgNames.push(i.name);});

    var gruntConfig = {};
    _.each(cfgNames, function(name) {
      gruntConfig[name] = grunt.config(name) || {};
    });

    files.forEach(function (filepath) {

      var config = c.process(filepath, grunt.config());

      _.each(cfgNames, function(name) {
        gruntConfig[name] = grunt.config(name) || {};
        grunt.config(name, _.extend(gruntConfig[name], config[name]));
      });

    });

    // log a bit what was added to config
    grunt.log.subhead('Configuration is now:');
    _.each(cfgNames, function(name) {
      grunt.log.subhead('  ' + name + ':').writeln('  ' + inspect(grunt.config(name)));
    });
  });
};
