// import { Plugin } from 'release-it';
import { execSync, exec } from 'child_process';
import semver from 'semver';
import parse from 'parse-git-config';
import bump from 'standard-version/lib/lifecycles/bump';
import simplegit from 'simple-git/promise';
import { forEachSeries } from 'p-iteration';
import { green, red, redBright, yellow } from 'chalk';
import matcher from 'matcher';
const { Plugin } = require('release-it');
const npm = require('release-it/lib/plugin/npm/npm');
// const versionTransformer = (context) => (input) =>
//   semver.valid(input)
//     ? semver.gt(input, context.latestVersion)
//       ? green(input)
//       : red(input)
//     : redBright(input);

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
    let matchPolicies:
      | { [key: string]: string | iConfig | iConfig[] }
      | undefined;
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
    } else if (typeof matchPolicies === 'string') {
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

  release() {
    npm.prototype.release = async function(version) {
      if (this.options.publish === false) return;

      const publish = () => this.publish({ otpCallback });
      const otpCallback = this.global.isCI
        ? null
        : (task) => this.step({ prompt: 'otp', task });
      await this.step({
        task: publish,
        label: 'npm publish',
        prompt: 'publish'
      });

      const choices: any[] = [];

      // ${this.getName()}
      try {
        this.exec(`npm view react dist-tags`, {
          write: false
        });
        Object.keys(
          JSON.parse(
            await this.exec(`npm view react dist-tags -json`, {
              write: false
            })
          )
        ).forEach((value) => {
          choices.push({ name: value, value });
        });
      } catch (error) {}

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
          message: () => `Please enter a valid version:`,
          transformer: (context) => (input) =>
            semver.valid(input) ? redBright(input) : green(input),
          validate: (input) =>
            !semver.valid(input) ||
            'The version must follow the semver standard.'
        }
      };
      this.registerPrompts(prompts);

      let tag;
      await this.step({
        prompt: 'tagList',
        task: (r) => {
          tag = r;
        }
      });
      console.log('tag;;;;;;', tag);
      // this.step({
      //   prompt: 'tagList',
      //   task: (increment) =>
      //     increment
      //       ? resolve(increment)
      //       : this.step({ prompt: 'tag', task: resolve })
      // });

      this.setContext({ version, tag });
      return this.spinner.show({ task, label: 'npm version' });
    };
  }

  bump(version) {
    console.log('bump----------------', version);

    // npm.prototype.bump = async function(version) {
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
    //   // const tag = this.options.tag || (await this.resolveTag(version));

    //   const choices: any[] = [];

    //   // ${this.getName()}
    //   try {
    //     this.exec(`npm view react dist-tags`, {
    //       write: false
    //     });
    //     Object.keys(
    //       JSON.parse(
    //         await this.exec(`npm view react dist-tags -json`, {
    //           write: false
    //         })
    //       )
    //     ).forEach((value) => {
    //       choices.push({ name: value, value });
    //     });
    //   } catch (error) {}

    //   const prompts = {
    //     tagList: {
    //       type: 'list',
    //       message: () => 'Select a npm-dist-tag:',
    //       choices: () => [
    //         ...choices,
    //         {
    //           name: 'Other, please specify...',
    //           value: null
    //         }
    //       ],
    //       pageSize: 9
    //     },
    //     tag: {
    //       type: 'input',
    //       message: () => `Please enter a valid version:`,
    //       transformer: (context) => (input) =>
    //         semver.valid(input) ? redBright(input) : green(input),
    //       validate: (input) =>
    //         !semver.valid(input) ||
    //         'The version must follow the semver standard.'
    //     }
    //   };
    //   this.registerPrompts(prompts);

    //   let tag;
    //   await this.step({
    //     prompt: 'tagList',
    //     task: (r) => {
    //       tag = r;
    //     }
    //   });
    //   console.log('tag;;;;;;', tag);
    //   // this.step({
    //   //   prompt: 'tagList',
    //   //   task: (increment) =>
    //   //     increment
    //   //       ? resolve(increment)
    //   //       : this.step({ prompt: 'tag', task: resolve })
    //   // });

    //   this.setContext({ version, tag });
    //   return this.spinner.show({ task, label: 'npm version' });
    // };
  }

  getTags() {
    return this.exec(`npm view gfrp dist-tags`, {
      write: false
    }).catch(() => null);
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
