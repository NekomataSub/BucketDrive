# Autenticacao

BucketDrive usa Better Auth no backend da API. A sessao e validada no servidor e o frontend apenas consome o estado autenticado.

## Fluxo

1. O usuario inicia login em `/login`.
2. O frontend chama os endpoints de Better Auth.
3. O provedor OAuth retorna para a aplicacao.
4. A API valida a sessao e resolve o usuario.
5. As rotas autenticadas verificam permissao no backend.

## Onboarding

O primeiro usuario cujo email corresponde a `PLATFORM_OWNER_EMAIL` pode se tornar administrador da plataforma e criar/configurar o bucket inicial.

## Regras de seguranca

- Backend e a fonte de verdade.
- Frontend nao deve decidir autorizacao sozinho.
- Rotas sensiveis devem usar middleware de auth e RBAC.
- Platform admin deve ser verificado por middleware dedicado.

## Variaveis relevantes

```env
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
PLATFORM_OWNER_EMAIL=
```
