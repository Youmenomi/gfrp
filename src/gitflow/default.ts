export default {
  gitflow: true,
  supports: [
    {
      master: 'support/1.x',
      develop: 'develop-1.x',
      feature: 'feature/',
      hotfix: 'hotfix/',
      release: 'release/',
      support: 'support/',
      versiontag: ''
    }
  ],
  commandArgs: {
    featureStart: { F: false },
    featureFinish: {
      F: false,
      r: false,
      k: false
    },
    releaseStart: { F: false },
    releaseFinish: {
      F: false,
      s: false,
      u: '',
      m: '',
      p: false,
      k: false,
      n: false
    },
    hotfixStart: { F: false },
    hotfixFinish: {
      F: false,
      s: false,
      u: '',
      m: '',
      p: false,
      k: false,
      n: false
    },
    supportStart: { F: false }
  },
  policyset: {
    develop: {
      prerelease: [{ name: 'alpha', npmTags: ['alpha', 'next'] }, '%h']
    },
    'feature/*': {
      prerelease: [
        '%r',
        { name: 'experimental-%h', npmTags: ['alpha', 'next'] },
        { name: 'experimental-%h', finishArgs: 'rFk' }
      ],
      finishArgs: 'rFk',
      npmTags: ['alpha', 'next']
    },
    'release/*': {
      prerelease: ['beta', 'rc']
    },
    'hotfix/*': {
      prerelease: ['beta', 'rc']
    }
  }
};
