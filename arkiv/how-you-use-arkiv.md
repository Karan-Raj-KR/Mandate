# How we use Arkiv

**Do the things we filter on, who can edit each entity, and when it expires fit what the app does?**

- **Filter:** by `rootId`, because the product question is "what authority exists under this root right now". That is one indexed query, then local verification. We also look up single delegations by `id` (the ENS CLI walks a chain parent by parent).
- **Who can edit:** nobody. Delegations are signed and immutable, so we never call `patchEntity`. Anyone can write entities under our schema name, so reads are restricted with `ownedBy(trustedWriter)` and then verified cryptographically; a forged entity cannot pass signature and root-issuer checks.
- **Expiry:** each entity expires when its delegation does, so the database cleans itself. We still re-check expiry ourselves, because Arkiv's expiry is a convenience and is counted in blocks.

**Does each Arkiv feature we use change something users see?**

- Indexed attributes + `ownedBy`: the Authority Explorer lists only genuinely usable authority from a single query. Without them it would need our server to enumerate.
- Native expiry: expired authority disappears from the explorer without us running a cleanup job.
- Owner-held entities readable by anyone: a counterparty can look up delegations it never received without asking our server.

**Where we deviated from our own spec:** one publisher wallet writes all entities instead of each issuer writing its own, to avoid funding several wallets. The security model does not depend on this.
