import type { NextConfig } from 'next';

const config: NextConfig = {
  // Estatico ainda, mas NAO mais pelo motivo da ADR-05 — ela foi revertida pela
  // ADR-08 e agora existe backend. O editor continua sem servidor PROPRIO: ele
  // e um cliente da API de build, que roda em outra origem. Publicar como
  // estatico e o mais simples para uma aplicacao que so fala HTTP com a API.
  output: 'export',
  reactStrictMode: true,
  // Os pacotes do workspace sao consumidos do fonte, entao precisam ser
  // transpilados junto com a aplicacao.
  transpilePackages: [
    '@vislow/visual-kit',
    '@vislow/config-schema',
    '@vislow/component-registry',
    '@vislow/build-contract',
  ],
};

export default config;
