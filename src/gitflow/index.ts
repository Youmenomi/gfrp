// import { Plugin } from 'release-it';
import { execSync } from 'child_process';
import semver from 'semver';
import parse from 'parse-git-config';
import bump from 'standard-version/lib/lifecycles/bump';
import simplegit from 'simple-git/promise';
import { forEachSeries } from 'p-iteration';
import { green, red, redBright, yellow } from 'chalk';
import matcher from 'matcher';
const { Plugin } = require('release-it');
const npm = require('release-it/lib/plugin/npm/npm');
const Git = require('release-it/lib/plugin/git/Git');
const GitHub = require('release-it/lib/plugin/github/GitHub');
// const versionTransformer = (context) => (input) =>
//   semver.valid(input)
//     ? semver.gt(input, context.latestVersion)
//       ? green(input)
//       : red(input)
//     : redBright(input);

const _ = require('lodash');
const isCI = require('is-ci');
// const Config = require('release-it/lib/config');
// Config.prototype.mergeOptions = function() {
//   console.log('mergeOptions1111111');
//   this.defaultConfig.github.draft = false;
//   return _.defaultsDeep(
//     {},
//     this.constructorConfig,
//     {
//       ci: isCI || undefined
//     },
//     this.localConfig,
//     this.defaultConfig
//   );
// };
// console.log('mergeOptions000000', Config.prototype.options);

type iConfig = {
  release?: boolean;
  prerelease?: string;
  options?: any;
  npm?: { tag: string | string[] };
};

const versionTransformer = (context) => (input) =>
  semver.valid(input)
    ? semver.gt(input, context.latestVersion)
      ? green(input)
      : red(input)
    : redBright(input);

const getReleaseChoices = async (context) => {
  let matchPolicies: iConfig[] | iConfig = context.matchPolicies;
  const {
    matchPrefix,
    gitCurrentBranch
  }: {
    matchPrefix: string;
    gitCurrentBranch: string;
  } = context;
  const latestVersion = context.latestVersion;

  const choices: { name: string; value: any }[] = [];

  if (!Array.isArray(matchPolicies)) matchPolicies = [matchPolicies];

  await forEachSeries(matchPolicies, async (policy) => {
    if (policy.release !== true && typeof policy.prerelease !== 'string') {
      throw new Error('The release policy of the branch is incorrect.');
    }

    const args: any = {};
    args.silent = true;
    args.dryRun = true;
    args.skip = {};
    args.skip.changelog = true;

    if (policy.prerelease) {
      let prerelease = policy.prerelease;
      if (policy.prerelease.includes('%r')) {
        const r = gitCurrentBranch.substr(matchPrefix.split('*')[0].length);
        prerelease = prerelease.replace(/%r/g, r);
      }
      if (policy.prerelease.includes('%h')) {
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
    let newVersion = await bump(args, latestVersion);
    if (args.prerelease && policy.prerelease!.includes('%h')) {
      const i = newVersion.lastIndexOf('.');
      newVersion = newVersion.substr(0, i);
    }

    choices.push({
      name: `${
        policy.release ? red('release') : yellow('prerelease')
      } (${newVersion})`,
      value: newVersion
    });
  });

  const otherChoice = {
    name: 'Other, please specify...',
    value: null
  };

  return [...choices, otherChoice];
};

export default class GitFlow extends Plugin {
  constructor({
    namespace,
    options = {},
    global = {},
    container = {}
  }: any = {}) {
    super({ namespace, options, global, container });

    this.config.defaultConfig.github.draft = true;
    this.config.options = _.defaultsDeep(
      {},
      this.config.constructorConfig,
      {
        ci: isCI || undefined
      },
      this.config.localConfig,
      this.config.defaultConfig
    );

    const superInit = GitHub.prototype.init;
    GitHub.prototype.init = async function() {
      await superInit.call(this);
      this.options = Object.freeze(
        this.getInitialOptions(this.config.getContext(), 'github')
      );
    };
  }

  async init() {
    const GIT_CONFIG = await parse();
    const isGitFlowInit = Boolean(GIT_CONFIG['gitflow "branch"']);

    if (!isGitFlowInit && (await this.promptGitFlowInit())) {
      execSync('git flow init', { stdio: 'inherit' });
    }
  }

  async getIncrementedVersion(options) {
    const git = simplegit();
    const gitStatus = await git.status();
    const gitCurrentBranch = gitStatus.current;

    const gfrpConfig = this.getContext();

    let matchPrefix: string | undefined;
    let matchPolicies: string | iConfig | iConfig[] | undefined;
    Object.keys(gfrpConfig).some((prefix) => {
      const r = matcher.isMatch(gitCurrentBranch, prefix);
      if (r) {
        matchPrefix = prefix;
        matchPolicies = gfrpConfig[prefix];
      }
      return r;
    });

    if (
      !matchPolicies ||
      (Array.isArray(matchPolicies) && matchPolicies.length === 0)
    ) {
      this.log.warn('No corresponding release policy found.');
      return null;
    } else if (
      Array.isArray(matchPolicies) ||
      typeof matchPolicies === 'object'
    ) {
      matchPolicies = ([] as any).concat(matchPolicies);
    } else {
      throw new TypeError(`failed: ${matchPolicies}`);
    }
    this.setContext({
      gitCurrentBranch,
      matchPrefix,
      matchPolicies,
      latestVersion: options.latestVersion
    });

    this.registerPrompts(await this.createPrompts());
    return this.promptReleaseVersion();
  }

  bump(version) {
    // npm.prototype.bump = function() {
    //   const task = () =>
    //     this.exec(`npm version ${version} --no-git-tag-version`).catch(
    //       (err) => {
    //         if (/version not changed/i.test(err)) {
    //           this.log.warn(
    //             `Did not update version in package.json, etc. (already at ${version}).`
    //           );
    //         }
    //       }
    //     );
    //   return this.spinner.show({ task, label: 'npm version' });
    // };

    // this.setContext({
    //   gitCurrentBranch,
    //   matchPrefix,
    //   matchPolicies,
    //   latestVersion: options.latestVersion
    // });
    const { gitCurrentBranch } = this.getContext();

    const {
      tagDependsOnCommit = true
      // releaseDependsOnPush = true
    } = this.options;
    Git.prototype.release = async function() {
      switch (gitCurrentBranch) {
        case 'release':
          execSync(`git flow release finish`, {
            stdio: 'inherit'
          });
          break;
        case 'hotfix':
          break;
        default:
          this.commit();
          this.tag();
          break;
      }

      const { commit, tag, push } = this.options;
      let isCommit = false;
      await this.step({
        enabled: commit,
        task: () => {
          isCommit = true;
          this.commit();
        },
        label: 'Git commit',
        prompt: 'commit'
      });
      if (tagDependsOnCommit && isCommit)
        await this.step({
          enabled: isCommit,
          task: () => this.tag(),
          label: 'Git tag',
          prompt: 'tag'
        });
      await this.step({
        enabled: push,
        task: () => this.push(),
        label: 'Git push',
        prompt: 'push'
      });
    };

    npm.prototype.release = async function() {
      if (this.options.publish === false) return;

      this.registerPrompts({
        publish: {
          type: 'confirm',
          message: () => 'Publish to npm?',
          default: true
        }
      });

      let isPublish = false;
      await this.step({
        task: () => {
          isPublish = true;
        },
        prompt: 'publish'
      });

      if (!isPublish) return;

      let tag;
      if (this.options.tag) {
        tag = this.options.tag;
      } else if (this.global.isCI) {
        tag =
          this.getContext().matchPolicies[0] ||
          (await this.resolveTag(version));
      } else {
        const choices: any[] = [];

        if (this.getContext().isNewPackage) {
          const DEFAULT_TAG = 'latest';
          const DEFAULT_TAG_PRERELEASE = 'next';
          choices.push(
            { name: DEFAULT_TAG, value: DEFAULT_TAG },
            {
              name: DEFAULT_TAG_PRERELEASE,
              value: DEFAULT_TAG_PRERELEASE
            }
          );
        } else {
          this.exec(`npm view ${this.getName()} dist-tags`, {
            write: false
          });
          Object.keys(
            JSON.parse(
              await this.exec(`npm view ${this.getName()} dist-tags -json`, {
                write: false
              })
            )
          ).forEach((value) => {
            choices.push({ name: value, value });
          });
        }

        const prompts = {
          tagList: {
            type: 'list',
            message: () => 'Select a npm-dist-tag:',
            choices: () => [
              ...choices,
              {
                name: 'Other, please specify...',
                value: null
              }
            ],
            pageSize: 9
          },
          tag: {
            type: 'input',
            message: () => `Please enter a valid tag:`,
            transformer: (context) => (input) => {
              return semver.validRange(input) ? redBright(input) : green(input);
            },
            validate: (input) =>
              semver.validRange(input)
                ? 'Tag name must not be a valid SemVer range.'
                : true
          }
        };
        this.registerPrompts(prompts);

        await this.step({
          prompt: 'tagList',
          task: (r) => {
            tag = r;
          }
        });

        if (!tag) {
          await this.step({
            prompt: 'tag',
            task: (r) => {
              tag = r;
            }
          });
        }
      }
      this.setContext({ version, tag });

      const publish = () => this.publish({ otpCallback });

      const otpCallback = this.global.isCI
        ? null
        : (task) => this.step({ prompt: 'otp', task });

      await this.spinner.show({ task: publish, label: 'npm publish' });
    };
  }

  async createPrompts() {
    const choices = await getReleaseChoices(this.getContext());
    return {
      releaseList: {
        type: 'list',
        message: () => 'Specify a new version:',
        choices: () => choices,
        pageSize: 9
      },
      version: {
        type: 'input',
        message: () => `Please enter a valid version:`,
        transformer: (context) => versionTransformer(context),
        validate: (input) =>
          !!semver.valid(input) ||
          'The version must follow the semver standard.'
      }
    };
  }

  promptReleaseVersion() {
    return new Promise((resolve) => {
      this.step({
        prompt: 'releaseList',
        task: (increment) =>
          increment
            ? resolve(increment)
            : this.step({ prompt: 'version', task: resolve })
      });
    });
  }

  promptGitFlowInit() {
    return new Promise((resolve) => {
      this.step({
        prompt: 'gitflowInit',
        task: resolve
      });
    });
  }
}
