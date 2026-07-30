# SPIKE R-B — prova que `pbiviz package` roda headless, sem display e sem
# certificado. O certificado e exigido pelo `pbiviz start` (servidor de dev),
# nao pelo `package`.
#
# Este e o formato do worker de build do backend: entra a fonte gerada pelo
# codegen, sai o .pbiviz.
FROM node:22-slim

WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json pbiviz.json capabilities.json ./
COPY src ./src
COPY style ./style
COPY assets ./assets

RUN npx pbiviz package
