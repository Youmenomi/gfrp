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
      'os',
      'path',
      'util',
      'readline',
      'events',
      'child_process',
      'conventional-recommended-bump',
      'parse-git-config, prompts',
      'simple-git/promise'
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
  })
)
