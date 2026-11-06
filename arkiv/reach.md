# Reach

**Who is it for, and would they use it?**

Teams running AI agents that call paid or sensitive APIs, and the services those agents call. The concrete buyer is whoever owns a resource boundary (a payments API, a booking service, a merchant endpoint) and wants to accept requests from agents it has never met, several hops from a human owner, without trusting the agent's own claim.

**Can they try it today, and will we keep building it?**

- Today: clone the repo, fill `.env`, run the commands in the README. Our deployed registry and ENS name are on Sepolia, and the Arkiv query in the README runs against our writer wallet.
- After Mumbai: we have not committed to a roadmap, and we have no users yet. This is a hackathon build, so we are not claiming adoption. The part most reusable on its own is the verifier in `packages/core` plus the registry contract.

_Numbers (entities written, distinct roots queried) will be added here from a live run once the writer wallet is funded._
