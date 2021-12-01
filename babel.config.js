module.exports = {
  env: {
    test: {
      presets: [
        '@babel/preset-env',
        '@babel/preset-react',
        '@babel/preset-typescript',
      ],
      plugins: ['@babel/plugin-transform-runtime'],
    },
  },
  presets: [
    [
      '@babel/preset-env',
      {
        modules: false,
        loose: true,
        exclude: ['transform-typeof-symbol', 'transform-regenerator'],
      },
    ],
    '@babel/preset-react',
    '@babel/preset-typescript',
  ],
};
