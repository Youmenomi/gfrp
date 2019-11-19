declare module 'standard-version/lib/lifecycles/bump' {
  declare type props = {
    pkgFiles: string[];
  };
  const bump: props & ((args: any, version: string) => Promise<string>);
  export default bump;
}

declare module 'standard-version/lib/latest-semver-tag' {
  const latestSemverTag: () => Promise<string>;
  export default latestSemverTag;
}
