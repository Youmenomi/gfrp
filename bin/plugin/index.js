'use strict';

// import { plugin } from 'realease-it';
const {
  plugin
} = require('realease-it'); // const versionTransformer = (context) => (input) =>
//   semver.valid(input)
//     ? semver.gt(input, context.latestVersion)
//       ? green(input)
//       : red(input)
//     : redBright(input);
// const prompts = {
//   incrementList: {
//     type: 'list',
//     message: () => 'Select increment (next version):',
//     choices: (context) => getIncrementChoices(context),
//     pageSize: 9
//   },
//   version: {
//     type: 'input',
//     message: () => `Please enter a valid version:`,
//     transformer: (context) => versionTransformer(context),
//     validate: (input) =>
//       !!semver.valid(input) || 'The version must follow the semver standard.'
//   }
// };


class GitFlow extends plugin {
  constructor(...args) {
    super(...args); // this.registerPrompts(prompts);

    console.log('[GitFlow Plugin]', args);
  }

  getIncrementedVersion(options) {
    console.log('[GitFlow Plugin]', options);
  } //   async getIncrementedVersion(options) {
  //     const { isCI } = this.global;
  //     const version = this.incrementVersion(options);
  //     return (
  //       version || (isCI ? null : await this.promptIncrementVersion(options))
  //     );
  //   }
  //   promptIncrementVersion(options) {
  //     return new Promise((resolve) => {
  //       this.step({
  //         prompt: 'incrementList',
  //         task: (increment) =>
  //           increment
  //             ? resolve(
  //                 this.incrementVersion(Object.assign({}, options, { increment }))
  //               )
  //             : this.step({ prompt: 'version', task: resolve })
  //       });
  //     });
  //   }


}

module.exports = GitFlow;
//# sourceMappingURL=index.js.map
