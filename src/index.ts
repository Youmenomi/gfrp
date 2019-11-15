import { execSync } from 'child_process';
// import conventionalRecommendedBump from 'conventional-recommended-bump';
import parse from 'parse-git-config';
import prompts from 'prompts';
// import simplegit from 'simple-git/promise';

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

  // const git = simplegit();
  // const gitStatus = await git.status();
  // const currBranch = gitStatus.current;

  const cc = {
    a: [
      {
        type: 'select',
        name: '0',
        message: 'Pick a color',
        choices: [
          {
            title: 'Red',
            description: 'This option has a description',
            value: '#ff0000'
          },
          { title: 'Green', value: '#00ff00', disabled: true },
          { title: 'Blue', value: '#0000ff' }
        ],
        initial: 1
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

  const response = await prompts(cc.a);

  log('end.', response);
})();

function log(...arg: any[]) {
  // eslint-disable-next-line no-console
  console.log('[cli.js]', ...arg);
}
