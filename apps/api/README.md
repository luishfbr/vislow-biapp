# @vislow/api — API de build

Recebe a arvore que o usuario montou, gera um projeto `pbiviz` de verdade, compila e devolve o `.pbiviz`.
E a materializacao da ADR-08.

Contrato HTTP, codigos de erro, pipeline, variaveis de ambiente e armadilhas do worker:
**[docs/backend.md](../../docs/backend.md)**. As invariantes ficam em [CLAUDE.md](CLAUDE.md).

```bash
pnpm dev      # sobe tudo na ordem certa — API em http://localhost:3001
pnpm check    # verify + o gate de aceite (compila um .pbiviz de verdade)
```
