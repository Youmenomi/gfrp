import { execSync } from 'child_process';
import { type } from 'os';
import semver from 'semver';
import parse from 'parse-git-config';
import bump from 'standard-version/lib/lifecycles/bump';
import simplegit from 'simple-git/promise';
import { forEachSeries } from 'p-iteration';
import { green, red, redBright, yellow } from 'chalk';
import matcher from 'matcher';
const { EOL } = require('os');
const { Plugin } = require('release-it');
const npm = require('release-it/lib/plugin/npm/npm');
const Git = require('release-it/lib/plugin/git/Git');
const GitHub = require('release-it/lib/plugin/github/GitHub');

const _ = require('lodash');
const isCI = require('is-ci');

type iGFConfig = {
  master: string;
  develop: string;
  feature: string;
  bugfix: string;
  release: string;
  support: string;
  versiontag: string;
};

type iOpts = {
  startArgs?: string;
  finArgs?: string;
  npmTags?: string[];
};
type iPrereleaseWithiOpts = {
  name: string;
} & iOpts;
type iConfig = {
  release?: boolean | iOpts;
  prerelease?:
    | string
    | iPrereleaseWithiOpts
    | (string | iPrereleaseWithiOpts)[];
} & iOpts;

const versionTransformer = (context) => (input) =>
  semver.valid(input)
    ? semver.gt(input, context.latestVersion)
      ? green(input)
      : red(input)
    : redBright(input);

const getNewVersion = async (
  gitCurrentBranch: string,
  matchPrefix: string,
  latestVersion: string,
  prerelease?: string
) => {
  const args: any = {};
  args.silent = true;
  args.dryRun = true;
  args.skip = {};
  args.skip.changelog = true;

  if (prerelease) {
    if (prerelease.includes('%r')) {
      const r = gitCurrentBranch.substr(matchPrefix.split('*')[0].length);
      prerelease = prerelease.replace(/%r/g, r);
    }
    if (prerelease.includes('%h')) {
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
  if (args.prerelease && prerelease!.includes('%h')) {
    const i = newVersion.lastIndexOf('.');
    newVersion = newVersion.substr(0, i);
  }

  return newVersion;
};

const createChoice = async (
  context,
  policy: boolean | iOpts | string | iPrereleaseWithiOpts,
  prerelease?: string
) => {
  const matchPolicies: iConfig = context.matchPolicies;
  const {
    matchPrefix,
    gitCurrentBranch
  }: {
    matchPrefix: string;
    gitCurrentBranch: string;
  } = context;
  const latestVersion = context.latestVersion;

  const { finArgs, npmTags } = policy as iOpts;
  const newVersion = await getNewVersion(
    gitCurrentBranch,
    matchPrefix,
    latestVersion,
    prerelease
  );
  return {
    name: newVersion,
    value: _.defaults(
      { newVersion, finArgs, npmTags },
      { finArgs: matchPolicies.finArgs, npmTags: matchPolicies.npmTags }
    )
  };
};
const getReleaseChoices = async (context) => {
  const matchPolicies: iConfig = context.matchPolicies;
  const choices: { name: string; value: any }[] = [];

  if (matchPolicies.release) {
    choices.push(await createChoice(context, matchPolicies.release));
  }

  if (matchPolicies.prerelease) {
    const policies = Array.isArray(matchPolicies.prerelease)
      ? matchPolicies.prerelease
      : [matchPolicies.prerelease];

    await forEachSeries(policies, async (policy) => {
      choices.push(
        await createChoice(
          context,
          policy,
          typeof policy === 'string' ? policy : policy.name
        )
      );
    });
  }

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
    const overwriteDefaultConfig = {
      git: {
        requireUpstream: false
      },
      github: {
        draft: true
      }
    };
    this.config.options = _.defaultsDeep(
      {},
      this.config.constructorConfig,
      {
        ci: isCI || undefined
      },
      this.config.localConfig,
      overwriteDefaultConfig,
      this.config.defaultConfig
    );

    this.hackGit();

    const superInit = GitHub.prototype.init;
    GitHub.prototype.init = async function() {
      await superInit.call(this);
      this.options = Object.freeze(
        this.getInitialOptions(this.config.getContext(), 'github')
      );
    };
  }

  hackGit() {
    const superInit = Git.prototype.init;
    Git.prototype.init = async function() {
      this.options = Object.freeze(
        this.getInitialOptions(this.config.getContext(), 'git')
      );
      await superInit.call(this);
    };
  }

  async init() {
    const {
      gitflow
    }: { gitflow: boolean; polycies: iConfig } & iOpts = this.options;

    if (gitflow) {
      if (this.global.isCI) {
        throw new Error(
          'failed: Git Flow workflow does not support CI mode.' +
            EOL +
            'Alternatively, use `--no-gfrp.gitflow` to release without git-flow workflow' +
            ' (or save `"gfrp.gitflow": false` in the configuration).'
        );
      }

      const GIT_CONFIG = await parse();
      const isGitFlowInit = Boolean(GIT_CONFIG['gitflow "branch"']);
      if (!isGitFlowInit) {
        this.registerPrompts({
          gitflowInit: {
            type: 'confirm',
            message: () =>
              'Detected that Git flow is not installed. Do you want to install it?',
            default: true
          }
        });
        if (await this.promptGitFlowInit()) {
          execSync('git flow init', { stdio: 'inherit' });
        } else {
          throw new Error(
            'failed: Git flow is not installed.' +
              EOL +
              'Alternatively, use `--no-gfrp.gitflow` to release without git-flow workflow' +
              ' (or save `"gfrp.gitflow": false` in the configuration).'
          );
        }
      }
      const gfConfig: iGFConfig = {
        ...GIT_CONFIG['gitflow "branch"'],
        ...GIT_CONFIG['gitflow "prefix"']
      };
      this.setContext({ gfConfig });
    }

    const git = simplegit();
    const gitStatus = await git.status();
    const gitCurrentBranch = gitStatus.current;

    const { gfConfig }: { gfConfig: iGFConfig } = this.getContext();

    if (gfConfig) {
      switch (gitCurrentBranch) {
        case gfConfig.master:
          await this.gfSelectAction();
          break;
        case gfConfig.develop:
          break;
      }
    }

    const gfrpConfig = this.getContext();

    let matchPrefix: string | undefined;
    let matchPolicies: string | iConfig | undefined;
    Object.keys(gfrpConfig).some((prefix) => {
      const r = matcher.isMatch(gitCurrentBranch, prefix);
      if (r) {
        matchPrefix = prefix;
        matchPolicies = gfrpConfig[prefix];
      }
      return r;
    });

    if (!matchPolicies) {
      this.log.warn('No corresponding release policy found.');
      return null;
    } else if (typeof matchPolicies === 'string') {
      throw new TypeError(`failed: ${matchPolicies}`);
    }

    this.setContext({
      gitCurrentBranch,
      matchPrefix,
      matchPolicies
    });

    // gfConfig.

    //   switch (gitCurrentBranch.split('/')[0]) {
    //     case gfMaster:
    //       execSync(`git flow release finish`, {
    //         stdio: 'inherit'
    //       });
    //       break;
    //     case 'gfDevelop':
    //       execSync(`git flow release finish`, {
    //         stdio: 'inherit'
    //       });
    //       break;
    //     case 'feature':
    //       execSync(`git flow release finish`, {
    //         stdio: 'inherit'
    //       });
    //       break;
    //     case 'release':
    //       execSync(`git flow release finish`, {
    //         stdio: 'inherit'
    //       });
    //       break;
    //     case 'hotfix':
    //       execSync(`git flow release finish`, {
    //         stdio: 'inherit'
    //       });
    //       break;
    //     default:
    //       this.commit();
    //       this.tag();
    //       break;
    //   }
  }

  gfSelectAction() {
    this.registerPrompts({
      gfSelectAction: {
        type: 'list',
        message: () => 'Recommended actions:',
        choices: () => [
          {
            name: 'Start a New Feature',
            value: ['feature', 'start']
          },
          {
            name: 'Start a New Release',
            value: ['release', 'start']
          },
          { name: 'Start a New Hotfix', value: ['hotfix', 'start'] },
          { name: 'Finish Feature', value: ['feature', 'finish'] },
          { name: 'Finish Release', value: ['release', 'finish'] },
          { name: 'Finish Hotfix', value: ['hotfix', 'finish'] }
        ],
        pageSize: 9
      }
    });
    return this.asyncPromptStep({ prompt: 'gfSelectAction' });
  }

  async getIncrementedVersion(options) {
    this.setContext({ latestVersion: options.latestVersion });

    this.registerPrompts(await this.createPrompts());
    const policy = await this.promptReleaseVersion();

    this.setContext({ policy });
    console.log('policy:', policy);
    return policy.newVersion;
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
    const { gitCurrentBranch, matchPrefix, matchPolicies } = this.getContext();

    // const {
    //   tagDependsOnCommit = true
    // releaseDependsOnPush = true
    // } = this.options;
    Git.prototype.release = async function() {
      switch (gitCurrentBranch.split('/')[0]) {
        case 'feature':
          this.commit();

          const prompts = {
            finArgs: {
              type: 'checkbox',
              message: () => 'Select options to finish feature:',
              choices: () => [
                {
                  name: '-r rebase instead of merge',
                  value: 'r'
                },
                {
                  name: '-F fetch from $ORIGIN before performing finish',
                  value: 'F'
                },
                {
                  name: '-k keep branch after performing finish',
                  value: 'k'
                },
                {
                  name: '-D force delete feature branch after finish',
                  value: 'D'
                },
                {
                  name: 'S squash feature during merge',
                  value: 'S'
                }
              ],
              default: [],
              pageSize: 9
            },
            finishOptions: {
              type: 'input',
              message: () => `Please enter a valid tag:`,
              transformer: (context) => (input) => {
                return semver.validRange(input)
                  ? redBright(input)
                  : green(input);
              },
              validate: (input) =>
                semver.validRange(input)
                  ? 'Tag name must not be a valid SemVer range.'
                  : true
            }
          };
          this.registerPrompts(prompts);
          await this.step({
            task: () => {
              isCommit = true;
              this.commit();
            },
            label: 'Finish feature',
            prompt: 'finishfeature'
          });

          execSync(`git flow feature finish`, {
            stdio: 'inherit'
          });
          break;
        case 'release':
          execSync(`git flow release finish`, {
            stdio: 'inherit'
          });
          break;
        case 'hotfix':
          execSync(`git flow release finish`, {
            stdio: 'inherit'
          });
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

    const npmTags = this.getContext().policy.npmTags;
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
        tag = npmTags[0] || (await this.resolveTag(version));
      } else {
        const choices: any[] = [];

        if (npmTags) {
          npmTags.forEach((value) => {
            choices.push({ name: value, value });
          });
        } else if (this.getContext().isNewPackage) {
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

  async promptReleaseVersion() {
    let policy;
    await this.step({
      prompt: 'releaseList',
      task: (r) => (policy = r)
    });
    if (policy) return policy;

    await this.step({
      prompt: 'version',
      task: (newVersion) => {
        policy = { newVersion };
      }
    });
    return policy;
  }

  promptGitFlowInit() {
    return new Promise((resolve) => {
      this.step({
        prompt: 'gitflowInit',
        task: resolve
      });
    });
  }

  asyncPromptStep(options) {
    return new Promise((resolve) => {
      this.step({
        ...options,
        task: resolve
      });
    });
  }
}
