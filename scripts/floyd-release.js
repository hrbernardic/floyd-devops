const yargsParser = require('yargs-parser');
const releaseIt = require('release-it');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const parsedArgs = yargsParser(process.argv, {
  boolean: ['dry-run', 'help'],
  alias: {
    d: 'dry-run',
    h: 'help'
  }
});

console.log('parsedArgs', parsedArgs);

if (!parsedArgs.local && !process.env.GH_TOKEN) {
  console.error('process.env.GH_TOKEN is not set');
  process.exit(1);
}

if (parsedArgs.help) {
  console.log(`
      Usage: yarn floyd-release <version> [options]
      Example: "yarn floyd-release 1.0.0-beta.1"
      The acceptable format for the version number is:
      {number}.{number}.{number}[-{alpha|beta|rc}.{number}]
      The subsection of the version number in []s is optional, and, if used, will be used to
      mark the release as "prerelease" on GitHub, and tag it with "next" on npm.
      Options:
        --dry-run           Do not touch or write anything, but show the commands
        --help              Show this message
    `);
  process.exit(0);
}

console.log('> git fetch --all');
childProcess.execSync('git fetch --all', {
  stdio: [0, 1, 2]
});

function parseVersion(version) {
  if (!version || !version.length) {
    return {
      version,
      isValid: false,
      isPrerelease: false
    };
  }
  const sections = version.split('-');
  if (sections.length === 1) {
    /**
     * Not a prerelease version, validate matches exactly the
     * standard {number}.{number}.{number} format
     */
    return {
      version,
      isValid: !!sections[0].match(/\d+\.\d+\.\d+$/),
      isPrerelease: false
    };
  }
  /**
   * Is a prerelease version, validate each section
   * 1. {number}.{number}.{number} format
   * 2. {alpha|beta|rc}.{number}
   */
  return {
    version,
    isValid: !!(
      sections[0].match(/\d+\.\d+\.\d+$/) &&
      sections[1].match(/(alpha|beta|rc)\.\d+$/)
    ),
    isPrerelease: true
  };
}

const parsedVersion = parseVersion(parsedArgs._[2]);
if (!parsedVersion.isValid) {
  console.error(
    `\nError:\nThe specified version is not valid. You specified: "${parsedVersion.version}"`
  );
  console.error(
    `Please run "yarn floyd-release --help" for details on the acceptable version format.\n`
  );
  return process.exit(1);
} else {
  console.log('parsed version: ', JSON.stringify(parsedVersion));
}

const { devDependencies } = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../package.json'))
);
const cliVersion = devDependencies['@angular/cli'];
const typescriptVersion = devDependencies['typescript'];
const prettierVersion = devDependencies['prettier'];

console.log('Executing build script:');
// const buildCommand = `./scripts/package.sh ${parsedVersion.version} ${cliVersion} ${typescriptVersion} ${prettierVersion}`;
const buildCommand = 'node scripts/build-libs.js';
console.log(`> ${buildCommand}`);
childProcess.execSync(buildCommand, {
  stdio: [0, 1, 2]
});

/**
 * Create working directory and copy over built packages
 */
// childProcess.execSync('rm -rf build/npm && mkdir -p build/npm', {
//   stdio: [0, 1, 2]
// });
// childProcess.execSync('cp -R build/packages/* build/npm', {
//   stdio: [0, 1, 2]
// });
/**
 * Get rid of tarballs at top of copied directory (made with npm pack)
 */
// childProcess.execSync(`find build/npm -maxdepth 1 -name "*.tgz" -delete`, {
//   stdio: [0, 1, 2]
// });

/**
 * Setting this to true can be useful for development/testing purposes.
 * No git commands, nor npm publish commands will be run when this is
 * true.
 */
const DRY_RUN = !!parsedArgs['dry-run'];

/**
 * Set the static options for release-it
 */
const options = {
  'dry-run': DRY_RUN,
  changelogCommand: 'conventional-changelog -p angular | tail -n +3',
  /**
   * Needed so that we can leverage conventional-changelog to generate
   * the changelog
   */
  safeBump: false,
  /**
   * All the package.json files that will have their version updated
   * by release-it
   */
  pkgFiles: [
    'package.json',
    'dist/libs/core/package.json',
    'dist/libs/common/package.json',
    'dist/libs/components/package.json',
    // 'build/npm/create-nx-workspace/package.json',
    // 'build/npm/jest/package.json',
    // 'build/npm/cypress/package.json',
    // 'build/npm/storybook/package.json',
    // 'build/npm/angular/package.json',
    // 'build/npm/react/package.json',
    // 'build/npm/next/package.json',
    // 'build/npm/web/package.json',
    // 'build/npm/node/package.json',
    // 'build/npm/express/package.json',
    // 'build/npm/nest/package.json',
    // 'build/npm/workspace/package.json',
    // 'build/npm/cli/package.json',
    // 'build/npm/tao/package.json',
    // 'build/npm/eslint-plugin-nx/package.json',
    // 'build/npm/linter/package.json',
    // 'build/npm/nx-plugin/package.json'
  ],
  increment: parsedVersion.version,
  requireUpstream: false,
  github: {
    preRelease: parsedVersion.isPrerelease,
    release: false,
    /**
     * The environment variable containing a valid GitHub
     * auth token with "repo" access (no other permissions required)
     */
    token:  process.env.GH_TOKEN
  },
  npm: {
    /**
     * We don't use release-it to do the npm publish, because it is not
     * able to understand our multi-package setup.
     */
    publish: false
  },
  requireCleanWorkingDir: false
};

releaseIt(options)
  .then(output => {
    if (DRY_RUN) {
      console.warn('WARNING: In DRY_RUN mode - not running publishing script');
      process.exit(0);
      // return;
    }}

    )
  .catch(err => {
      console.error(err.message);
      process.exit(1);
    });


// if (parsedArgs.nobazel) {
    // childProcess.execSync('rm -rf ./build/packages/bazel');
    // childProcess.execSync('rm -rf ./build/npm/bazel');
    // }

    /**
     * We always use either "latest" or "next" (i.e. no separate tags for alpha, beta etc)
     */

    // NPM PUBLISH
  //   const npmTag = parsedVersion.isPrerelease ? 'next' : 'latest';
  //   const npmPublishCommand = `./scripts/publish.sh ${
  //     output.version
  //   } ${npmTag} ${parsedArgs.local ? '--local' : ''}`;
  //   console.log('Executing publishing script for all packages:');
  //   console.log(`> ${npmPublishCommand}`);
  //   console.log(
  //     `Note: You will need to authenticate with your NPM credentials`
  //   );
  //   childProcess.execSync(npmPublishCommand, {
  //     stdio: [0, 1, 2]
  //   });
  //   process.exit(0);
  // })