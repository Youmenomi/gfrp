import { execSync } from 'child_process';
import { type } from 'os';
import readline from 'readline';
import semver from 'semver';
import parse from 'parse-git-config';
import bump from 'standard-version/lib/lifecycles/bump';
import simplegit from 'simple-git/promise';
import { forEachSeries } from 'p-iteration';
import { green, red, redBright, yellow, reset } from 'chalk';
import matcher from 'matcher';
// import conventionalRecommendedBump, {
//   releaseType
// } from 'conventional-recommended-bump';

import _ from 'lodash';
import defaultOptions from './default';
const { EOL } = require('os');
const { Plugin } = require('release-it');

const isCI = require('is-ci');
const gitSemverTags = require('git-semver-tags');
const Version = require('release-it/lib/plugin/version/Version');
const Git = require('release-it/lib/plugin/git/Git');
const GitLab = require('release-it/lib/plugin/gitlab/GitLab');
const GitHub = require('release-it/lib/plugin/github/GitHub');
const npm = require('release-it/lib/plugin/npm/npm');

type iGitFlowConfig = {
  master: string;
  develop: string;
  feature: string;
  hotfix: string;
  release: string;
  support: string;
  versiontag: string;
};

type iOpts = {
  finArgs?: string;
  npmTags?: string[];
};
type iPrereleaseWithiOpts = {
  name: string;
} & iOpts;
type iMatchPolicies = {
  release?: boolean | iOpts;
  prerelease?:
    | string
    | iPrereleaseWithiOpts
    | (string | iPrereleaseWithiOpts)[];
} & iOpts;

type iGitFlowBranches = Omit<iGitFlowConfig, 'versiontag'>;
type iGitFlowCurrent = keyof iGitFlowBranches;

type iGitFlowStartOrFinish = 'start' | 'finish';
type iGitFlowStartOrFinishName = string;
type iGitFlowActioin = [
  iGitFlowCurrent,
  iGitFlowStartOrFinish,
  iGitFlowStartOrFinishName
];
type iSelectActionResult = [iGitFlowCurrent, iGitFlowStartOrFinish];

type iMainResult = {
  type: 'develop' | 'current' | 'other';
  matchPrefix: string;
  matchPolicies: iMatchPolicies;
};

type iContext = {
  gfConfig: iGitFlowConfig;
  gfCurrent: iGitFlowCurrent;
  gitCurrentBranch: string;
  matchPrefix: string;
  matchPolicies: iMatchPolicies;
  latestVersion: string;
  mainResult: iMainResult;
};

type iOptions = {
  gitflow: boolean;
  policyset: { [key: string]: iMatchPolicies };
  commandArgs: {
    featureStart: { F: boolean };
    featureFinish: {
      F: boolean;
      r: boolean;
      k: boolean;
    };
    releaseStart: { F: false };
    releaseFinish: {
      F: boolean;
      s: boolean;
      u: string;
      m: string;
      p: boolean;
      k: boolean;
      n: boolean;
    };
    hotfixStart: { F: boolean };
    hotfixFinish: {
      F: boolean;
      s: boolean;
      u: string;
      m: string;
      p: boolean;
      k: boolean;
      n: boolean;
    };
    supportStart: { F: false };
  };
};

type iReleaseListResult = { newVersion: string; policy?: iPrereleaseWithiOpts };

const gfWorkflow = [
  'master',
  'develop',
  'feature',
  'release',
  'hotfix',
  'support'
] as const;

const versionTransformer = (context) => (input) =>
  semver.valid(input)
    ? semver.gt(input, context.latestVersion)
      ? green(input)
      : red(input)
    : redBright(input);

const defaultPluginClasses = [Version, Git, GitLab, GitHub, npm];
const defaultPlugins: any[] = [];

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

    defaultPluginClasses.forEach((pluginClass) => {
      const superInit = pluginClass.prototype.init;
      pluginClass.prototype.init = async function() {
        await superInit.call(this);
        this.options = Object.freeze(
          this.getInitialOptions(this.config.getContext(), 'github')
        );
        defaultPlugins.push(this);
      };
    });
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
    const git = simplegit();
    const gitStatus = await git.status();
    const gitCurrentBranch = gitStatus.current;

    const { gitflow, policyset } = this.options as iOptions;

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
      const gfConfig: iGitFlowConfig = {
        ...GIT_CONFIG['gitflow "branch"'],
        ...GIT_CONFIG['gitflow "prefix"']
      };

      let gfCurrent: iGitFlowCurrent | undefined;
      gfWorkflow.some((name) => {
        if (gitCurrentBranch.indexOf(gfConfig[name]) === 0) {
          gfCurrent = name;
          return true;
        }
        return false;
      });

      this.setContext({ gfConfig, gfCurrent });
    }

    const { matchPrefix, matchPolicies } = this.getMatchPrefixAndPolicies(
      gitCurrentBranch
    );

    if (!matchPolicies) {
      this.log.warn('No corresponding release policy found.');
      return null;
    }

    this.setContext({
      gitCurrentBranch,
      matchPrefix,
      matchPolicies
    });

    // if(matchPolicies.release){

    // }

    // const choices = [];

    // const { gfConfig }: { gfConfig: iGFConfig } = this.getContext();
    // if (gfConfig) {
    //   if (gfConfig.master === gitCurrentBranch) {
    //     // choices.push
    //   }
    // } else {
    // }

    // const choices = [];
    // choices;

    // this.registerPrompts({
    //   gfrpSelect: {
    //     type: 'list',
    //     message: () => 'Select one:',
    //     choices: () => {
    //       return [];
    //     }
    //   }
    // });

    // const gfAction = await this.gfSelectAction();

    // if (gfAction[1] === 'finish') {
    //   const candidates = execSync(
    //     `git branch --no-color --list '${
    //       gfConfig[gfAction[0] as 'feature' | 'release' | 'hotfix']
    //     }*'`
    //   )
    //     .toString()
    //     .replace('* ', '')
    //     .replace('  ', '')
    //     .split('\n')
    //     .slice(0, -1);

    //   if (candidates.length === 0) {
    //   } else {
    //     await this.gfSelectBranch(candidates);
    //   }
    // } else {
    // }
    // // (develop * feature) / dotest;
    // // master;
    // gfConfig.asd.dff.dff;

    // if (gfConfig) {
    //   switch (gitCurrentBranch) {
    //     case gfConfig.master:
    //       await this.gfSelectAction();
    //       break;
    //     case gfConfig.develop:
    //       break;
    //   }
    // }

    // const gfrpConfig = this.getContext();

    // let matchPrefix: string | undefined;
    // let matchPolicies: string | iConfig | undefined;
    // Object.keys(gfrpConfig).some((prefix) => {
    //   const r = matcher.isMatch(gitCurrentBranch, prefix);
    //   if (r) {
    //     matchPrefix = prefix;
    //     matchPolicies = gfrpConfig[prefix];
    //   }
    //   return r;
    // });

    // if (!matchPolicies) {
    //   this.log.warn('No corresponding release policy found.');
    //   return null;
    // } else if (typeof matchPolicies === 'string') {
    //   throw new TypeError(`failed: ${matchPolicies}`);
    // }

    // this.setContext({
    //   gitCurrentBranch,
    //   matchPrefix,
    //   matchPolicies
    // });

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

  getMatchPrefixAndPolicies(branch: string) {
    const { policyset } = this.options as iOptions;
    let matchPrefix: string | undefined;
    let matchPolicies: iMatchPolicies | undefined;
    Object.keys(policyset).some((prefix) => {
      if (matcher.isMatch(branch, prefix)) {
        matchPrefix = prefix;
        matchPolicies = policyset[prefix];
        return true;
      }
      return false;
    });
    return matchPrefix && matchPolicies ? { matchPrefix, matchPolicies } : null;
  }
  async gfSelectAction() {
    this.registerPrompts({
      gfSelectAction: {
        type: 'list',
        message: () => 'Select one:',
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
          { name: 'Other Action...', value: null }
        ]
      },
      gfSelectOther: {
        type: 'list',
        message: () => 'Select one:',
        choices: () => [
          { name: 'Finish Feature', value: ['feature', 'finish'] },
          { name: 'Finish Release', value: ['release', 'finish'] },
          { name: 'Finish Hotfix', value: ['hotfix', 'finish'] },
          { name: 'Other Action...', value: null }
        ]
      }
    });

    let result = await this.asyncPromptStep<iSelectActionResult | null>({
      prompt: 'gfSelectAction'
    });
    if (!result) {
      this.deleteCurrentLine();
      result = await this.asyncPromptStep<iSelectActionResult | null>({
        prompt: 'gfSelectOther'
      });
    }

    if (!result) {
      this.deleteCurrentLine();
      result = (await this.gfSelectAction()) as iSelectActionResult;
    }

    return result as iSelectActionResult;
  }

  async gfEnterStartOrFinishName(rr: iSelectActionResult) {
    this.registerPrompts({
      enterStartOrFinishName: {
        type: 'input',
        message: () => `${rr[0]} Name:`,
        transformer: (context) => (input) => {
          return this.validateStartOrFinishName(input)
            ? green(input)
            : redBright(input);
        },
        validate: (input: string) =>
          this.validateStartOrFinishName(input)
            ? true
            : `'${input}' is not a valid name`
      }
    });

    return [
      ...rr,
      await this.asyncPromptStep<string>({
        prompt: 'enterStartOrFinishName'
      })
    ] as iGitFlowActioin;
  }

  async gfSelectGitFlowCommandArgs(rr: iSelectActionResult) {
    const a1 = execSync(`git flow ${rr[0]} ${rr[1]} -h`)
      .toString()
      // .split('flags:')[1]
      .split('\n');

    // a1.

    this.registerPrompts({
      selectGitFlowCommandArgs: {
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
      }
    });

    return [
      ...rr,
      await this.asyncPromptStep<string>({
        prompt: 'enterStartOrFinishName'
      })
    ] as iGitFlowActioin;
  }

  validateStartOrFinishName(name: string) {
    try {
      execSync(`git check-ref-format --branch "${name}"`, { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }

  gfSelectBranch(branches: string[]) {
    this.registerPrompts({
      gfSelectBranch: {
        type: 'list',
        message: () => 'Select one:',
        choices: () => {
          return branches.map((name) => {
            return { name, value: name };
          });
        }
      }
    });

    return this.asyncPromptStep({
      prompt: 'gfSelectBranch'
    });
  }

  deleteCurrentLine() {
    readline.moveCursor(process.stdout, 0, -1);
    readline.clearScreenDown(process.stdout);
  }

  async getIncrementedVersion(options: {
    latestVersion: string;
    increment: string;
    isPreRelease: boolean;
    preReleaseId: string;
  }) {
    const latestVersion = options.latestVersion;
    this.setContext({ latestVersion });

    this.registerPrompts(await this.createPrompts());
    const mainResult = await this.asyncPromptStep<iMainResult>({
      prompt: 'main'
    });
    this.setContext({ mainResult });
    // console.log('mainResult:', mainResult);

    let newVersion: string;

    let result: iReleaseListResult;

    switch (mainResult.type) {
      case 'develop':
        this.registerPrompts({
          releaseList: {
            type: 'list',
            message: () => 'Specify a new version:',
            choices: this.createChoices(
              await this.getReleaseChoices(mainResult.matchPolicies)
            ),
            pageSize: 9
          }
        });
        result = await this.promptReleaseVersion();
        this.setContext({ policy: result.policy });
        newVersion = result.newVersion;
        break;
      case 'current':
        result = await this.promptReleaseVersion();
        this.setContext({ policy: result.policy });
        newVersion = result.newVersion;
        break;
      case 'other':
        this.execGitFlowAction(
          await this.gfEnterStartOrFinishName(await this.gfSelectAction())
        );
        console.log(`🏁 Done (in ${Math.floor(process.uptime())}s.)`);
        process.exit();
    }

    // console.log('newVersion:', newVersion);
    // process.exit();

    // if (Array.isArray(next)) {
    //   this.execGitFlowAction(next);
    // } else if (next === 'release') {
    //   const { newVersion, policy } = await this.promptReleaseVersion();
    //   this.setContext({ policy });
    //   return newVersion;
    // } else {
    //   this.execGitFlowAction(await this.gfSelectAction());
    // }

    // const { newVersion, policy } = await this.promptReleaseVersion();
    // this.setContext({ policy });
    // console.log('policy:', policy);
    return newVersion!;
  }

  convertfinArgs(finArgs: string) {
    return ' -' + [...finArgs].join(' -');
  }
  execGitFlowAction(actoin: iGitFlowActioin) {
    const { matchPolicies } = this.getContext() as iContext;
    const startOrFinish = actoin[1];

    this.options;

    execSync(
      `git flow ${actoin[0]} ${startOrFinish}${
        startOrFinish === 'finish' && matchPolicies.finArgs
          ? this.convertfinArgs(matchPolicies.finArgs)
          : ''
      } ${actoin[2]}`,
      {
        stdio: 'inherit'
      }
    );
  }

  getStartedName(branch: string, prefix: string) {
    return branch.substr(prefix.length);
  }

  getMainChoices() {
    const {
      gitCurrentBranch,
      gfCurrent,
      gfConfig
    } = this.getContext() as iContext;

    const choices: { name: string; value: any }[] = [];

    switch (gfCurrent) {
      case 'master':
        break;
      case 'develop':
        break;
      case 'feature':
        let matchPrefixAndPolicies = this.getMatchPrefixAndPolicies(
          gfConfig.develop
        );
        if (matchPrefixAndPolicies) {
          choices.push({
            name: `release on develop${
              gfConfig.develop === 'develop' ? '' : `(${gfConfig.develop})`
            } ${reset.dim('(bump, commit and finish current)')}`,
            value: { type: 'develop', ...matchPrefixAndPolicies }
            // value: [
            //   'feature',
            //   'finish',
            //   this.getStartedName(gitCurrentBranch, gfConfig[gfCurrent])
            // ]
          });
        }
        matchPrefixAndPolicies = this.getMatchPrefixAndPolicies(
          gitCurrentBranch
        );
        if (matchPrefixAndPolicies) {
          choices.push({
            name: `release on current(${gitCurrentBranch})`,
            value: { type: 'current', ...matchPrefixAndPolicies }
          });
        }
        choices.push({
          name: 'Other (git-flow actions)',
          value: { type: 'other' }
        });
        break;
      case 'hotfix':
        break;
      case 'release':
        break;
      case 'support':
        break;
    }

    return choices;
  }

  async getReleaseChoices(matchPolicies: iMatchPolicies) {
    const choices: { name: string; value: any }[] = [];

    // if (matchPolicies.release) {
    //   choices.push(await this.createChoice(matchPolicies.release));
    // }

    if (matchPolicies.prerelease) {
      const policies = Array.isArray(matchPolicies.prerelease)
        ? matchPolicies.prerelease
        : [matchPolicies.prerelease];

      await forEachSeries(policies, async (policy) => {
        choices.push(
          await this.createChoice(
            policy,
            typeof policy === 'string' ? policy : policy.name
          )
        );
      });
    }

    // if(){

    // }

    const otherChoice = {
      name: 'Other, please specify...',
      value: null
    };

    return [...choices, otherChoice];
  }
  async createChoice(
    policy: string | iPrereleaseWithiOpts,
    prerelease?: string
  ) {
    const { matchPolicies } = this.getContext() as iContext;

    const { finArgs, npmTags } = policy as iOpts;
    const newVersion = await this.getNewVersion(prerelease);
    return {
      name: newVersion,
      value: { newVersion, policy }
    };
  }
  async getNewVersion(prereleaseFormula: string) {
    const {
      gitCurrentBranch,
      latestVersion,
      matchPrefix
    } = this.getContext() as iContext;

    // this.standardVersionBump('1.1.1.1');

    let prerelease: string;
    // if (prereleaseFormula) {
    prerelease = prereleaseFormula;
    if (prerelease.includes('%r')) {
      const r = gitCurrentBranch.substr(matchPrefix.split('*')[0].length);
      prerelease = prerelease.replace(/%r/g, r);
    }
    const hasHash = prerelease.includes('%h');
    if (hasHash) {
      const h = execSync('git log --format="%H" -n 1')
        .toString()
        .substr(0, 7);
      prerelease = prerelease.replace(/%h/g, h);
    }
    // }

    let newVersion: string;

    const isPrereleased = semver.prerelease(latestVersion);
    if (isPrereleased && isPrereleased[0] !== prerelease) {
      const latestRaw = semver.coerce(latestVersion)!.raw;
      const bumpRaw = semver.coerce(
        await this.standardVersionBump(latestVersion, {
          prerelease: isPrereleased[0]
        })
      )!.raw;
      if (bumpRaw !== latestRaw) {
        newVersion = `${bumpRaw}-${prerelease}${hasHash ? '' : '.0'}`;
      } else {
        const matchTag = await this.getMatchPretag(latestRaw, prerelease);
        if (matchTag) {
          const numBuild = Number(matchTag.split('.').pop());
          newVersion = `${latestRaw}-${prerelease}.${numBuild + 1}`;
        } else {
          newVersion = `${latestRaw}-${prerelease}${hasHash ? '' : '.0'}`;
        }
      }
    } else {
      newVersion = await this.standardVersionBump(latestVersion, {
        prerelease
      });
    }

    return newVersion;
  }

  // args.tagPrefix = 'v';
  // args.releaseAs = '2.0.0';
  // args.firstRelease = true;
  standardVersionBump(
    latest: string,
    opt?: { prerelease?: string; tagPrefix?: string }
  ) {
    let args: any = {};
    args.silent = true;
    args.dryRun = true;
    args.skip = {};
    args.skip.changelog = true;
    args = { ...args, ...opt };
    return bump(args, latest);
  }

  async getLastTag(prerelease?: string) {
    let lastTag;
    const tags = await this.getTags();
    tags.some((tag) => {
      const ar = semver.prerelease(tag);
      if (prerelease) {
        if (ar && ar[0] === prerelease) {
          lastTag = tag;
          return true;
        } else {
          return false;
        }
      } else if (!ar) {
        lastTag = tag;
        return true;
      } else {
        return false;
      }
    });
    return lastTag;
  }

  async getMatchPretag(version: string, prerelease: string) {
    let matchPretag: string | undefined;
    const tags = await this.getTags();
    tags.some((tag) => {
      const obj = semver.coerce(tag);
      const ar = semver.prerelease(tag);
      if (ar && ar[0] === prerelease && obj && obj.version === version) {
        matchPretag = tag;
        return true;
      } else {
        return false;
      }
    });
    return matchPretag;
  }

  getTags() {
    return new Promise<string[]>((resolve, reject) => {
      gitSemverTags(function(error: Error, tags: string[]) {
        if (error) reject(error);
        else resolve(tags);
      });
    });
  }
  // getRecommendedIncrement() {
  //   return new Promise<releaseType>((resolve, reject) => {
  //     conventionalRecommendedBump(
  //       { preset: `angular` },
  //       (error, recommendation) => {
  //         if (error) reject(error);
  //         else resolve(recommendation.releaseType);
  //       }
  //     );
  //   });
  // }
  async gfBump() {
    const prerelease = 'alpha';

    const tags = await this.getTags(prerelease);
    const latest = tags[0];

    const args: any = {};
    args.silent = true;
    args.dryRun = true;
    args.skip = {};
    args.skip.changelog = true;
    const newVersion = await bump(args, latest);

    // const recommendedIncrement = await this.getRecommendedIncrement();

    console.log(newVersion);
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
    const {
      gitCurrentBranch,
      matchPrefix,
      matchPolicies,
      mainResult
    } = this.getContext() as iContext;

    switch (mainResult.type) {
      case 'current':
        break;
      case 'other':
        defaultPlugins.forEach((plugin) => {
          plugin.release = () => {};
        });
        return;
        break;
    }

    // const {
    //   tagDependsOnCommit = true
    // releaseDependsOnPush = true
    // } = this.options;
    Git.prototype.release = async function() {
      switch (gitCurrentBranch.split('/')[0]) {
        case 'feature':
          // this.commit();

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

  createChoices(choices: { name: string; value: any }[]) {
    return () => choices;
  }

  async createPrompts() {
    const { matchPolicies } = this.getContext() as iContext;
    return {
      main: {
        type: 'list',
        message: () => 'Choose what you want to do:',
        choices: this.createChoices(this.getMainChoices()),
        pageSize: 9
      },
      releaseList: {
        type: 'list',
        message: () => 'Specify a new version:',
        choices: this.createChoices(
          await this.getReleaseChoices(matchPolicies)
        ),
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
    let result: iReleaseListResult | undefined;
    await this.step({
      prompt: 'releaseList',
      task: (r: iReleaseListResult) => (result = r)
    });
    if (result) return result;

    await this.step({
      prompt: 'version',
      task: (newVersion: string) => {
        result = { newVersion };
      }
    });
    return result!;
  }

  promptGitFlowInit() {
    return new Promise((resolve) => {
      this.step({
        prompt: 'gitflowInit',
        task: resolve
      });
    });
  }

  asyncPromptStep<T>(options) {
    return new Promise<T>((resolve) => {
      this.step({
        ...options,
        task: resolve
      });
    });
  }
}
