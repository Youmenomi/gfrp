'use strict';

// import { Plugin } from 'release-it';
const {
  Plugin
} = require('release-it'); // const versionTransformer = (context) => (input) =>
//   semver.valid(input)
//     ? semver.gt(input, context.latestVersion)
//       ? green(input)
//       : red(input)
//     : redBright(input);


const getIncrementChoices = context => {
  console.log('[GitFlow Plugin] getIncrementChoices', context); // const types = context.latestIsPreRelease ? t.latestIsPreRelease : context.isPreRelease ? t.preRelease : t.default;
  // const choices = types.map(increment => ({
  //   name: `${increment} (${semver.inc(context.latestVersion, increment, context.preReleaseId)})`,
  //   value: increment
  // }));

  const otherChoice = {
    name: 'Other, please specify...',
    value: '1.2.3'
  };
  return [otherChoice];
};

const prompts = {
  incrementList: {
    type: 'list',
    message: () => 'Select or specify a new version:',
    choices: context => getIncrementChoices(context),
    pageSize: 9
  }
};
class GitFlow extends Plugin {
  constructor(...args) {
    console.log('[GitFlow Plugin] constructor', args);
    super(...args);
    this.registerPrompts(prompts);
  }

  getIncrementedVersion(options) {
    console.log('[GitFlow Plugin] getIncrementedVersion', options);
    return this.promptIncrementVersion(options);
  }

  promptIncrementVersion(options) {
    return new Promise(resolve => {
      this.step({
        prompt: 'incrementList',
        task: resolve
      });
    });
  }

}

module.exports = GitFlow;
//# sourceMappingURL=gitflow.js.map
