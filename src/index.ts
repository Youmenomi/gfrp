import { execSync } from 'child_process';
// import conventionalRecommendedBump from 'conventional-recommended-bump';
import path from 'path';
import fs from 'fs-extra';
import parse from 'parse-git-config';
import prompts from 'prompts';
import simplegit from 'simple-git/promise';
import chalk from 'chalk';
import matcher from 'matcher';
import bump from 'standard-version/lib/lifecycles/bump';
import latestSemverTag from 'standard-version/lib/latest-semver-tag';
import { someSeries, forEachSeries } from 'p-iteration';
// import semver from 'semver';
import dotenv from 'dotenv';
const runTasks = require('release-it/lib/tasks');
const Version = require('release-it/lib/plugin/version/Version');
const Git = require('release-it/lib/plugin/git/Git');
// const Version = require('release-it/lib/plugin/version/Version');

dotenv.config();

(async () => {
  let pkg: { name: string; version: string } | undefined;
  await someSeries(bump.pkgFiles, async (filename) => {
    const pkgPath = path.resolve(process.cwd(), filename);
    try {
      const data = await fs.readFile(pkgPath, 'utf8');
      pkg = JSON.parse(data);
    } catch (error) {}
    return Boolean(pkg);
  });
  const currVersion = pkg ? pkg.version : await latestSemverTag();

  log(
    `🏆  Release a standard-version${
      pkg
        ? ` of ${chalk.bold(pkg.name)} (currently at ${chalk.bold(
            pkg.version
          )})`
        : ''
    }
    `
  );

  const git = simplegit();
  const gitStatus = await git.status();
  let currentBranch = gitStatus.current;
  currentBranch = 'develop';

  // if (gitStatus.files.length !== 0) {
  //   throw new Error(
  //     'failed: working dir must be clean. Please stage and commit your changes.'
  //   );
  // }

  const GIT_CONFIG = await parse();
  const isGitFlowInit = Boolean(GIT_CONFIG['gitflow "branch"']);
  // console.log(GIT_CONFIG);

  if (!isGitFlowInit) {
    const response = await prompts({
      type: 'confirm',
      name: 'value',
      message:
        'Detected that Git flow is not installed. Do you want to install it?',
      initial: true
    });

    if (response.value) {
      execSync('git flow init', { stdio: 'inherit' });
    }
  }

  //   [gitflow "branch"]
  // 	master = master
  // 	develop = develop
  // [gitflow "prefix"]
  // 	feature = feature/
  // 	release = release/
  // 	hotfix = hotfix/
  // 	support = support/
  //   versiontag = v

  // const gitflow = {
  //   branch: { master: 'master', develop: 'develop' },
  //   prefix: {
  //     feature: 'feature/',
  //     release: 'release/',
  //     hotfix: 'hotfix/',
  //     support: 'support/',
  //     versiontag: 'v'
  //   }
  // };

  const questions: prompts.PromptObject<string>[] = [];

  type iConfig = { release?: boolean; prerelease?: string; options?: any };
  const branchConfig: { [key: string]: string | iConfig | iConfig[] } = {
    master: 'You should not release directly on the master branch.',
    develop: [{ prerelease: 'alpha' }, { prerelease: '%h' }],
    'feature/*': [{ prerelease: 'alpha' }, { prerelease: '%r' }],
    'release/*': [
      { release: true },
      { prerelease: 'beta' },
      { prerelease: 'rc' }
    ],
    'hotfix/*': [
      { release: true },
      { prerelease: 'beta' },
      { prerelease: 'rc' }
    ]
  };

  let configName: undefined | string;
  Object.keys(branchConfig).some((value) => {
    if (matcher.isMatch(currentBranch, value)) configName = value;
  });

  const PROMPT_SPECIFY: prompts.PromptObject<string> = {
    type: (prev) => (!prev ? 'text' : prev === 'specify' ? 'text' : null),
    name: 'version',
    message: 'enter the specify version'
  };
  const PROMPT_COMMIT: prompts.PromptObject<string> = {
    type: 'confirm',
    name: 'isCommit',
    message: 'commit',
    initial: true
  };
  const PROMPT_PUSH: prompts.PromptObject<string> = {
    type: 'confirm',
    name: 'isPush',
    message: 'push',
    initial: false
  };

  type iChoice = {
    title: string;
    value: string;
  };

  const createChoice = async (config: iConfig, configName: string) => {
    if (config.release !== true && typeof config.prerelease !== 'string') {
      throw new Error('The release policy of the branch is incorrect.');
    }

    const args: any = {};
    args.silent = true;
    args.dryRun = true;
    args.skip = {};
    args.skip.changelog = true;

    if (config.prerelease) {
      let prerelease = config.prerelease;
      if (config.prerelease.includes('%r')) {
        const r = currentBranch.substr(configName.split('*')[0].length);
        prerelease = prerelease.replace(/%r/g, r);
      }
      if (config.prerelease.includes('%h')) {
        const h = execSync('git log --format="%H" -n 1')
          .toString()
          .substr(0, 7);
        prerelease = prerelease.replace(/%h/g, h);
      }
      args.prerelease = prerelease;
    }
    // args.tagPrefix = 'v';
    // args.releaseAs = '2.0.0';
    // args.firstRelease = true;
    let newVersion = await bump(args, currVersion);
    if (args.prerelease && config.prerelease!.includes('%h')) {
      const i = newVersion.lastIndexOf('.');
      newVersion = newVersion.substr(0, i);
    }
    return {
      title: `${
        config.release ? chalk.red('release') : chalk.yellow('prerelease')
      } (${newVersion})`,
      value: newVersion
    };

    // if (config.release) {
    //   // version = "1.0.1-rc.0"
    //   //   args = {}
    //   //   args.silent = true
    //   //   args.dryRun = true
    //   //   args.skip = {}
    //   //   args.skip.changelog = true
    //   //   args.releaseAs = '2.0.0'
    //   //   // args.firstRelease = true
    //   //   args.prerelease = 'alpha'
    //   // bump();

    //   const args: any = {};
    //   args.silent = true;
    //   args.dryRun = true;
    //   args.skip = {};
    //   args.skip.changelog = true;

    //   args.tagPrefix = '';
    //   args.releaseAs = '2.0.0';
    //   // args.firstRelease = true
    //   args.prerelease = 'alpha';
    //   const newVersion = bump(args, currVersion);
    //   return { title: `Release ${newVersion}`, value: newVersion };
    // } else if (config.prerelease) {
    //   return {
    //     title: 'Prerelease v1.1.0-alpha.0',
    //     value: 'v1.1.0-alpha.0'
    //   };
    // } else {
    //   return {
    //     title: 'Prerelease none',
    //     value: 'none'
    //   };
    // }
  };
  const getChoices = async (
    config: iConfig[] | iConfig,
    configName: string
  ) => {
    const choices = [];
    if (Array.isArray(config)) {
      await forEachSeries(config, async (value) => {
        choices.push(await createChoice(value, configName));
      });
    } else {
      choices.push(await createChoice(config, configName));
    }
    choices.push({ title: 'Other (specify)', value: 'specify' });
    return choices;
  };

  if (configName === undefined) {
    questions.push(PROMPT_SPECIFY);
  } else if (typeof branchConfig[configName] === 'string') {
    throw new TypeError(`failed: ${branchConfig[configName]}`);
  } else {
    questions.push(
      {
        type: 'select',
        name: 'version',
        message: 'Select or specify new version',
        choices: await getChoices(branchConfig[configName] as any, configName),
        initial: 0
      },
      PROMPT_SPECIFY
    );
  }

  questions.push(PROMPT_COMMIT, PROMPT_PUSH);
  const response = await prompts(questions);

  // execSync(
  //   `npx release-it --increment ${response.version} --github.release --npm.tag=rc --preRelease --no-git.requireCleanWorkingDir`,
  //   {
  //     stdio: 'inherit'
  //   }
  // );

  // Version.prototype.incrementVersion = () => {
  //   return response.version;
  // };

  // Git.prototype.commit = funciton({ message = this.options.commitMessage, args = this.options.commitArgs } = {}) {
  //   return this.exec(`git commit --message="${message}" ${args || ''}`).then(
  //     () => this.setContext({ isCommitted: true }),
  //     err => {
  //       this.debug(err);
  //       if (/nothing (added )?to commit/.test(err)) {
  //         this.log.warn('No changes to commit. The latest commit will be tagged.');
  //       } else {
  //         throw new GitCommitError(err);
  //       }
  //     }
  //   );
  // }

  Git.prototype.commit = function({
    message = this.options.commitMessage,
    args = this.options.commitArgs
  } = {}) {
    console.log('!!!!');
    return this.exec(`git commit --message="${message}" ${args || ''}`).then(
      () => this.setContext({ isCommitted: true }),
      (err) => {
        this.debug(err);
        if (/nothing (added )?to commit/.test(err)) {
          this.log.warn(
            'No changes to commit. The latest commit will be tagged.'
          );
        } else {
          throw new GitCommitError(err);
        }
      }
    );
  };

  // Object.defineProperty(
  //   Version,
  //   'assetsUrl',
  //   Object.getOwnPropertyDescriptor(CoAssetsPlugin.prototype, 'assetsUrl')!
  // );

  await runTasks({
    // increment: response.version,
    github: { release: true },
    npm: { tag: 'rc' },
    // preRelease: true,
    // preReleaseId: 'rc',
    dryRun: false,
    verbose: 0,
    commit: false,
    git: { requireCleanWorkingDir: false }
    // plugins: {
    //   Git: {
    //     commit: false
    //   }
    // }
    // plugins: {
    //   '@release-it/conventional-changelog': {
    //     preset: 'angular',
    //     infile: 'CHANGELOG.md'
    //   }
    // }
  });

  // execSync(`npx np --no-publish`, {
  //   stdio: 'inherit'
  // });

  log('end.', response.version);
})().catch((error) => {
  console.log(chalk.red(error.message));
  console.log(error.stack);
});

function log(...arg: any[]) {
  // eslint-disable-next-line no-console
  console.log(...arg);
}

// args.silent = true
//   args.dryRun = true
//   args.skip.changelog = true

//   version = "1.0.1-rc.0"
//   args = {}
//   args.silent = true
//   args.dryRun = true
//   args.skip = {}
//   args.skip.changelog = true
//   args.releaseAs = '2.0.0'
//   // args.firstRelease = true
//   args.prerelease = 'alpha'

process.on('SIGINT', function() {
  console.log('Exit now!');
  process.exit();
});
