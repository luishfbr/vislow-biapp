import type { NextConfig } from 'next';

const config: NextConfig = {
  // ADR-05: zero backend. O editor e 100% client-side e publica como estatico.
  output: 'export',
  reactStrictMode: true,
  // O visual-kit e consumido do fonte no workspace, entao precisa ser
  // transpilado junto com a aplicacao.
  transpilePackages: ['@vislow/visual-kit', '@vislow/config-schema'],
};

export default config;
