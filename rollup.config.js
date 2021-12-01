import path from 'path';
import babel from '@rollup/plugin-babel';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import resolve from '@rollup/plugin-node-resolve';
import typescript from 'rollup-plugin-typescript2';

import packageJson from './package.json';
const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];

function external(id) {
  return !id.startsWith('.') && !path.isAbsolute(id);
}

function resolveDir(dir) {
  if (!/\.(t|j)s$/.test(dir)) {
    return dir;
  }
  return path.dirname(dir);
}

const lib = {
  // Tell Rollup the entry point to the package
  input: 'lib/index.ts',
  // Tell Rollup which packages to ignore
  external: id => external(id),
  // Establish Rollup output
  output: [
    {
      dir: resolveDir(packageJson.module),
      format: 'es',
      sourcemap: true,
    },
    {
      dir: resolveDir(packageJson.main),
      format: 'cjs',
      exports: 'named',
      sourcemap: true,
    },
  ],
  plugins: [
    peerDepsExternal(),
    babel({
      extensions,
      exclude: /node_modules/,
      babelHelpers: 'bundled',
    }),
    resolve({
      extensions,
      preferBuiltins: false,
    }),
  ],
};

// Generate type declarations
const types = {
  input: 'lib/index.ts',
  plugins: [
    typescript({
      typescript: require('typescript'),
      useTsconfigDeclarationDir: true,
      clean: true,
      tsconfigOverride: {
        compilerOptions: { target: 'es5', emitDeclarationOnly: true },
      },
    }),
  ],
};

const configs = [lib, types];
export default configs;
