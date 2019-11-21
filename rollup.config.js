import json from 'rollup-plugin-json'
import filesize from 'rollup-plugin-filesize'
import commonjs from 'rollup-plugin-commonjs'
import resolve from 'rollup-plugin-node-resolve'
import { terser } from 'rollup-plugin-terser'
import babel from 'rollup-plugin-babel'
import { bin } from './package.json'

const extensions = ['.js', '.jsx', '.ts', '.tsx']

/**
 * @typedef  {import('rollup').OutputOptions} OutputOptions
 */

/**
 * @param {OutputOptions} output
 * @param {rollup.} withMin
 */
const build = (input, output, withMin = false) => {
  const config = {
    input,
    external: [
      'fs',
      'fs-extra',
      'os',
      'path',
      'util',
      'readline',
      'events',
      'child_process',
      'parse-git-config, prompts',
      'simple-git/promise',
      'chalk',
      'matcher',
      'standard-version/lib/lifecycles/bump',
      'standard-version/lib/latest-semver-tag',
      'p-iteration'
    ],
    plugins: [
      json(),
      resolve({ extensions }),
      commonjs(),
      babel({ extensions, include: ['src/**/*'] })
    ],
    output: []
  }

  /**
   * @type {OutputOptions}
   */
  const copy = { ...output }
  if (withMin) {
    copy.file = copy.file.replace(/.js$/, '.min.js')
    config.plugins.push(terser())
  } else {
    copy.sourcemap = true
  }
  config.plugins.push(filesize())
  config.output.push(copy)

  return withMin ? [build(output), config] : config
}

export default [].concat(
  build('./src/index.ts', {
    file: bin,
    format: 'cjs'
  }),
  build('./src/gitflow/index.ts', {
    file: 'bin/gitflow/index.js',
    format: 'cjs'
  })
)
