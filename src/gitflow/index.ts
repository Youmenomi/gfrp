// import { Plugin } from 'release-it';
import { execSync } from 'child_process';
import parse from 'parse-git-config';
import simplegit from 'simple-git/promise';
import { someSeries, forEachSeries } from 'p-iteration';
import matcher from 'matcher';
const { Plugin } = require('release-it');
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
};

const getReleaseChoices = async (context) => {
  const {
    matchPrefix,
    matchPolicies
  }: {
    matchPrefix: string;
    matchPolicies: iConfig[] | iConfig;
  } = context.matchPolicies;
  // gfPrefix;
  // currentBranch;

  const choices = [];
  if (Array.isArray(matchPolicies)) {
    await forEachSeries(matchPolicies, async (value) => {
      choices.push(await createChoice(value, matchPrefix));
    });
  } else {
    choices.push(await createChoice(matchPolicies, matchPrefix));
  }
  choices.push({ name: 'Other', value: null });
  return choices;
};

// const getIncrementChoices = (context) => {
//   console.log('[GitFlow Plugin] getIncrementChoices', context);
//   // const types = context.latestIsPreRelease ? t.latestIsPreRelease : context.isPreRelease ? t.preRelease : t.default;
//   // const choices = types.map(increment => ({
//   //   name: `${increment} (${semver.inc(context.latestVersion, increment, context.preReleaseId)})`,
//   //   value: increment
//   // }));
//   const otherChoice = {
//     name: 'Other, please specify...',
//     value: null
//   };
//   return [otherChoice];
// };

const prompts = {
  releaseList: {
    type: 'list',
    message: () => 'Select or specify a new version:',
    choices: (context) => getReleaseChoices(context),
    pageSize: 9
  }
};

export default class GitFlow extends Plugin {
  constructor(...args) {
    console.log('[GitFlow Plugin] constructor', args);
    super(...args);
    this.registerPrompts(prompts);
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

    const context = this.getContext();
    const gfrpConfig = context.gitflow;

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
    this.setContext({ matchPrefix, matchPolicies });
    return this.promptReleaseVersion();
  }

  getBranchName() {
    return this.exec('git rev-parse --abbrev-ref HEAD', { options }).catch(
      () => null
    );
  }

  promptReleaseVersion() {
    return new Promise((resolve) => {
      this.step({
        prompt: 'releaseList',
        task: resolve
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
