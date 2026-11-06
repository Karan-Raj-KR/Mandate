---
name: hackathon-prereqs
description: Use when building or polishing the Mandate dashboard UI (packages/dashboard): layout, cards, modals, toasts, forms, filters, demo fixtures, colors, live cross-app demo, or the pitch. Lists the 43 prepared hackathon building blocks and which ones Mandate uses.
---

# Hackathon prerequisites (from "The Prerequisites", Hetvi Solanki), applied to Mandate

**Top rule: never add a building block that does not appear in the demo.**
Mandate's UI is:
- **Chain view:** invoice | delegation tree | decision, plus attack controls.
- **Authority Explorer.**
- An optional "Issue mandate" flow.

Everything else is SKIP. Judges head straight to the core functionality.

## USE (build these, in this order)

| # | Block | How it maps to Mandate | Build note |
|---|---|---|---|
| 26 | Dashboard page | The Chain view is the dashboard | 3 columns desktop, stacked on mobile. Change data sources, not layout. |
| 12 | Cards (text heavy) | One card per delegation hop: ENS name, address, actions, maxAmount (USDC, 6 decimals), expiry, targets, signature tick, revocation status | Two text styles (label + mono value), subtle hover. Reuse one card component for every hop. |
| 5 | Notifications | Toast for every request outcome: "EXECUTED" or "DENIED: <check>" | One global toast system; content comes from the API result. |
| 6 | Popups | Small confirmations: "Copied", "Revocation sent" | Same toast system, short duration. |
| 7 | Modals | (a) Revoke-ancestor confirm (b) World ID approval for requests above $15 (c) Issue-mandate form | Modals hold forms; Esc + click-outside close; focus trap. |
| 9 | Fully integrated form | Issue mandate: actions (multi-select), maxAmount (number), expiry (date-time), targets (list or `*`) | Validate on the client, but the backend decides. Show server errors verbatim. |
| 8 | Dropdowns / radio / date range | Explorer filters: issuer, subject, actions, depth, expiry range | Keep multi-select vs single-select clear; date range as unix seconds. |
| 2 | Navbar | "Mandate" + tagline, links: Chain view / Explorer, "Trust limits" popover, MOCK DATA badge when on fixtures | Sticky, correct z-index; every link must work. |
| 35 | Dummy JSONs | `fixtures/`: normal + malicious invoice, sample delegation chains, the 3 demo outcomes | ONE data file (`lib/api.ts`) switches fixtures ↔ live; never show mock data as live. |
| 34 | Color palette | **Formal**: off-white / near-black, one accent; status green/red/amber ALWAYS with text labels | Mono font for hashes; readable on a 1080p recording and a phone. |
| 37 | Cross-app live working | The winning moment: agents running in separate terminals or laptops + this dashboard + Sepolia Etherscan, updating live as the attack runs | Poll or SSE the request timeline every 1–2 s; this is the demo's "wow". |
| 31 | Live updates (websocket idea) | Only for the live request timeline / revocation status, NOT chat | Prefer polling/SSE if a websocket server isn't already there. |

## MAYBE (only if everything above works by the scope freeze)
| # | Block | Use |
|---|---|---|
| 38 | Export to CSV/PDF | "Export evidence" for a request: chain, checks, tx hash, as JSON/CSV. Useful for judges, not required. |
| 1 | Landing page | A small hero above the Chain view with the opening line. No separate page, no parallax. |
| 40/41 | Text-to-speech / speech-to-text | Skip unless the team asks; it doesn't serve the authorization story. |

## SKIP for Mandate (don't build)
- **#3 Sidebar:** only 2 pages, the navbar is enough.
- **#4 Footer:** the sheet itself says judges never check it.
- **#10 Multilingual.**
- **#11 Maps.**
- **#13 Image cards** and **#36 Dummy images.**
- **#14 Carousel.**
- **#15/#16 Login/signup FE+BE:** identity is the wallet + World ID, not passwords.
- **#17 CRUD:** that's the backend's job. The dashboard only calls the existing endpoints.
- **#18 AI chatbot** and **#19 WhatsApp bot.**
- **#20 Voice navigation.**
- **#21 Video call.**
- **#22 Recommendation/search engine:** the Explorer filters are enough.
- **#23 OCR:** the procurement agent already reads invoices.
- **#24 IVR.**
- **#25 Calendar.**
- **#27 Profile page:** the Explorer covers "who holds what authority".
- **#28 Buy/sell** and **#29 Checkout.**
- **#30 Blogs/community.**
- **#32 Reels.**
- **#33 Quiz.**
- **#39 File handling:** fixtures only.
- **#42 Points** and **#43 Redeem.**

## Security UI rules (override everything above)
- Render invoice and model text as **plain text**, never HTML.
- Show **every** failed check (dimension, reason, parent → child value, edge index). Never collapse a denial into "error".
- "USABLE" only after signatures, structure and revocation all pass. Stale or failed reads show **DENIED**, never "unknown".
- A denied request shows "No side effect: balance unchanged".
- The UI never authorizes anything; it displays the backend's decision.

## Presentation tips from the sheet (use in the demo and pitch)
- **Presentation is as important as the product.** Similar projects often differ only in how they're presented.
- **Open with a fact or data point:** "This agent signed a request for 450. It was only authorized for 150. The payment service refused."
- **Add an emotional hook:** a real business losing money to a prompt-injected invoice.
- **Explain technicalities non-technically:** half the panel may not be technical. Say "each agent can only pass on less power than it got", then show the proof.
- **Show something live across apps** (block #37). It's the author's favourite winning move.
