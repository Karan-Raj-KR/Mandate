# Using and deploying Mandate

## Local (the whole thing)

`pnpm demo` starts the payment service in demo mode, seeds a fresh delegation chain, and starts the dashboard in live mode with run buttons. Ctrl-C stops all of it. It needs `SEPOLIA_RPC_URL` and `REGISTRY_ADDRESS` in `.env` because revocation is read from the real Sepolia registry. The buttons run the same scripts as the terminal (`pnpm pay`, `pnpm attack:*`, `pnpm seed`). "Revoke the root" sends a real Sepolia transaction from `OWNER_PK`, so that wallet needs a little Sepolia ETH.

## Hosted (Vercel): the dashboard in fixture mode

Deploying the dashboard on its own gives a public, clickable walkthrough of the three scenarios (honest invoice, poisoned invoice, owner revokes) on fixture data. Every screen carries the "MOCK DATA" badge. It holds no secrets and starts no processes: the run buttons (`/api/run`) and the World ID bypass proxy are off in production builds.

One-time, from your own terminal:

```bash
npx vercel login
cd packages/dashboard
npx vercel            # preview; answer the prompts, keep the defaults
npx vercel --prod     # production URL
```

If Vercel asks for settings in its web UI: framework Next.js, root directory `packages/dashboard`, build command `pnpm build`, and leave "include source files outside of the root directory" on (the dashboard imports `@mandate/core`). Do not set `NEXT_PUBLIC_SERVICE_URL` for this deployment.

## The live /verify page on a hosted build

`/verify` is not mock data. It reads ENS, Arkiv and the Sepolia registry from the server, holds no signing key, and needs only public values: `REGISTRY_ADDRESS`, `ROOT_ISSUER`, `USDC_ADDRESS`, `ARKIV_TRUSTED_OWNERS` and `SEPOLIA_RPC_URL` (a public RPC works). Without `ARKIV_ACCESS_KEY` it uses Arkiv's rate-limited public endpoint, so a limit shows up as a denial and never as a false pass.

## Hosted with a live backend (not set up)

The payment service is a long-running Express server with in-memory nonces and history, so it does not fit Vercel functions. To make a hosted dashboard live, run `pnpm service:demo` on a host that keeps a process running (Railway, Fly, a VM), set `NEXT_PUBLIC_SERVICE_URL` on the dashboard to that URL, and set `DASHBOARD_ORIGIN` on the service to the dashboard's origin. The run buttons stay local-only by design; a public site should not be able to trigger an on-chain revoke.
