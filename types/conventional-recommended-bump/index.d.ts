declare module 'conventional-recommended-bump' {
  export declare type optionsArgument = {
    ignoreReverted?: boolean;
    preset?: string;
    config?: any;
    whatBump?: (commits: string[]) => any;
    tagPrefix?: string;
    lernaPackage?: string;
  };
  export declare type releaseType = 'major' | 'minor' | 'patch' | undefined;

  const conventionalRecommendedBump: (
    options: optionsArgument,
    callback: (
      error: Error,
      recommendation: { releaseType: releaseType }
    ) => any
  ) => any;
  export default conventionalRecommendedBump;
}
