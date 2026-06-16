# Contratos de API

Os contratos publicos da API ficam em `packages/shared/src/contracts/` e usam Zod. O backend deve validar entrada e saida com esses schemas sempre que possivel.

## Padroes

- Requests e responses devem ter schema compartilhado.
- Erros seguem `ApiErrorSchema`.
- O frontend consome tipos derivados dos contratos.
- Mudancas de contrato exigem teste de contrato em `apps/api/src/__tests__/contracts/`.

## Areas principais

- `platform`: configuracoes globais, convites e idioma padrao
- `files`: listagem, upload, download e importacao R2
- `folders`: arvore e navegacao
- `shares`: links internos e externos
- `members`: membros e convites
- `dashboard`: resumo administrativo e auditoria
- `trash`: restauracao e exclusao permanente
- `search`: busca e filtros

## Compatibilidade

Mantenha campos existentes quando possivel. Para novos campos opcionais, defina defaults claros no backend e em migrations.

## Testes

Rode:

```bash
pnpm test:contracts
```
