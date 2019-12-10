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
    feature: {
      start: { F: false },
      finish: {
        F: false,
        r: true,
        k: false
      }
    },
    release: {
      start: { F: false },
      finish: {
        F: false,
        s: false,
        u: '123',
        m: '',
        p: true,
        k: false,
        n: false
      }
    },
    hotfix: {
      start: { F: false },
      finish: {
        F: false,
        s: false,
        u: '',
        m: '',
        p: false,
        k: false,
        n: false
      }
    },
    support: {
      start: { F: false }
    }
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
} as any;
