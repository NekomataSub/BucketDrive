# ADR-003: Drizzle Kit + SQLite local → D1 produção

## Status

Accepted

## Context

O BucketDrive usa Cloudflare D1 como banco de dados em produção. Em desenvolvimento local, o D1 não está disponível diretamente (depende de `wrangler dev --remote` que requer internet e consome quota).

Precisamos de uma estratégia que garanta:

- Desenvolvimento local offline (sem depender de internet)
- Schema idêntico entre dev e prod (zero divergência)
- Migrações versionadas e reproduzíveis
- TypeScript tipado para queries (sem SQL raw espalhado)
- Seeds para desenvolvimento e testes

O projeto já determinou:

- SQLite via `better-sqlite3` para desenvolvimento local
- D1 HTTP API para produção (Cloudflare Workers)
- Drizzle ORM como camada de abstração

## Decision

**Usar Drizzle Kit como ferramenta de migração com schema declarativo TypeScript.**

### Fluxo de trabalho

```
1. Definir schema em TypeScript
   packages/shared/src/db/schema.ts

2. Gerar migrações
   npx drizzle-kit generate

3. Aplicar em dev local (SQLite)
   npx tsx scripts/migrate.ts

4. Aplicar em produção (D1)
   npx wrangler d1 migrations apply <database name>
```

### Estrutura de arquivos

```txt
packages/shared/
  src/
    db/
      schema/
        users.ts
        workspaces.ts
        files.ts
        shares.ts
        audit.ts
        index.ts           # exporta todas as tabelas
      migrations/          # gerado por drizzle-kit
        0000_init.sql
        0001_add_share_attempts.sql
      seeds/
        dev.ts             # dados de desenvolvimento
        prod.ts            # seeds de produção (workspace default, roles)

scripts/
  migrate.ts              # aplica migrações no SQLite local
  seed.ts                 # popula banco local com seeds
```

### Configuração Drizzle

```ts
// packages/shared/src/db/index.ts
import { drizzle } from "drizzle-orm/better-sqlite3"
import { drizzle as drizzleD1 } from "drizzle-orm/d1"

// Dev local
export function createLocalDB(path: string) {
  const sqlite = new Database(path)
  return drizzle(sqlite, { schema })
}

// Produção (Worker)
export function createD1DB(d1: D1Database) {
  return drizzleD1(d1, { schema })
}
```

## Alternatives Considered

### Migrações SQL manuais

- **Prós**: controle total sobre SQL, portabilidade máxima
- **Contras**: propenso a erro humano, divergência dev/prod, sem type-safety, difícil de revisar em PR
- **Rejeitado porque**: escala mal com schema complexo e múltiplos contribuidores

### Drizzle Push (sem migrações)

- **Prós**: zero boilerplate, rápido para prototipar
- **Contras**: sem histórico de mudanças, sem rollback, perigoso em produção (altera schema live sem revisão)
- **Rejeitado porque**: inaceitável para produção. Migrações versionadas são mandatórias.

### Prisma

- **Prós**: ORM maduro, tooling completo, Studio visual
- **Contras**: bundle grande (runtime engine), performance inferior em Workers, suporte D1 via driver adapter (mais complexo), código gerado vs schema-in-code
- **Rejeitado porque**: Drizzle é mais leve, mais idiomático TypeScript e melhor integração com Workers/D1

### Kysely

- **Prós**: query builder TypeScript puro, excelente type-safety
- **Contras**: sem migration tooling built-in, boilerplate manual para schema, curva de aprendizado maior
- **Rejeitado porque**: Drizzle oferece ORM completo + migration kit + type-safety com menos boilerplate

## Consequences

### Positivas

- Schema como código TypeScript (type-safe, revisável em PR)
- Migrações automáticas versionadas (SQL gerado, revisável)
- Mesma API para SQLite local e D1 produção
- Seeds versionados e reproduzíveis
- Tipagem TypeScript completa para queries (autocomplete, refatoração segura)

### Negativas

- Drizzle Kit ainda evolui ativamente (breaking changes ocasionais em major versions)
- D1 tem diferenças sutis do SQLite nativo que o `drizzle-orm/d1` abstrai, mas podem surgir em queries complexas
- Melhor testar queries no D1 preview antes de subir para produção em casos complexos

### Mitigações

- Fixar versão do Drizzle no `package.json`
- Testes de integração com `wrangler dev --remote` em CI para validar queries D1
- Manter queries SQL puras apenas em repositórios, usando Drizzle query builder para todo o resto

## References

- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Drizzle D1 Driver](https://orm.drizzle.team/docs/get-started/cloudflare-d1)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
