declare module 'parse-git-config' {
  declare type props = {
    sync: (config?: { cwd?: string; path?: string }) => any;
    expandKeys: (config: any) => any;
  };

  const parse: props & (() => Promise);
  export default parse;
}
