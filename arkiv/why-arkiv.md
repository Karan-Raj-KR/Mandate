# Why Arkiv

**If we swapped Arkiv for Postgres, what would our users lose?**

Mandate removes the single trusted operator from authorization across organisations. A Postgres table of delegations would put one vendor back in charge of "what authority exists", which is exactly the role we are trying to remove. On Arkiv:

- A counterparty can query delegations issued by someone it does not trust, **without asking our server**, then verify the signatures itself.
- Entities are owned by wallets and the same query works for anyone with the schema name, so the record is not ours to hide or rewrite.
- Expiry is built in, which matches authority that is meant to be short-lived.

**What we kept off Arkiv, and why**

- **Revocation.** It must be shared state a service reads at the moment of execution, with finality and a minimal contract. It lives on Ethereum.
- **The security decision.** The payment service never trusts anything fetched from Arkiv. It verifies the signed chain itself. Arkiv distributes and indexes authority; it does not grant it.
- **Nonces and balances.** Per-request state belongs to the service that owns the asset.

**Honest limit.** Arkiv does not make a delegation valid. If Arkiv were down, payment services keep working because the chain travels with the request; only discovery and the explorer degrade.
