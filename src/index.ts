import { execSync } from 'child_process';
// import conventionalRecommendedBump from 'conventional-recommended-bump';
import parse from 'parse-git-config';
import prompts from 'prompts';
import simplegit from 'simple-git/promise';

// conventionalRecommendedBump(
//   {
//     preset: `angular`,
//     tagPrefix: 'v'
//   },
//   (error, recommendation) => {
//     if (error) {
//       // eslint-disable-next-line no-console
//       console.log(error.message);
//     } else {
//       // eslint-disable-next-line no-console
//       console.log(recommendation.releaseType);
//     }
//   }
// );

(async () => {
  const GIT_CONFIG = await parse();
  const isGitFlowInit = Boolean(GIT_CONFIG['gitflow "branch"']);
  // log(GIT_CONFIG);
  if (!isGitFlowInit) {
    const response = await prompts({
      type: 'confirm',
      name: 'value',
      message: 'Git flow is not installed. Do you want to install it?',
      initial: true
    });

    if (response.value) {
      execSync('git flow init', { stdio: 'inherit' });
    }
  }

  const git = simplegit();
  const gitStatus = await git.status();
  // const currBranch = gitStatus.current;
  console.log(gitStatus);

  const cc = {
    a: [
      {
        type: 'select',
        name: 'version',
        message: 'Pick a color',
        choices: [
          { title: 'Release v1.0.0', value: 'v1.0.0' },
          { title: 'Prerelease v1.0.0-beta.0', value: 'v1.0.0-beta.0' },
          { title: 'Prerelease v1.0.0-rc.0', value: 'v1.0.0-rc.0' },
          { title: 'Other (specify)', value: 'specify' },
        ],
        initial: 1
      },
      {
        type: (prev) => (prev === 'specify' ? 'text' : null),
        name: 'version',
        message: 'enter the specify version',
      }
    ] as Array<prompts.PromptObject<string>>,
    b: [
      {
        type: 'confirm',
        name: '0',
        message: 'commit changes immediately?',
        initial: true
      },
      {
        type: (prev) => (prev ? 'confirm' : null),
        name: '1',
        message: 'Push commits immediately?',
        initial: false
      }
    ] as Array<prompts.PromptObject<string>>
  };

  // const response = await prompts(cc.a);

  log('end.');
})();

function log(...arg: any[]) {
  // eslint-disable-next-line no-console
  console.log('[cli.js]', ...arg);
}
