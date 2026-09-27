# South Beach Delivery

A top-down, GTA 2 style delivery driver game set in South Beach, Miami Beach. It's plain HTML, CSS, and JavaScript on a canvas, with no build step and no dependencies.

## How to play

1. Drive to the McDonald's on Collins Ave & 16th St and stop inside the yellow ring to pick up the order.
2. Follow the arrow (and the radar) to the customer: a hotel on Ocean Dr, an address on a side street, a lifeguard tower on the beach, and so on. Stop inside the green ring to drop it off.
3. You get base pay plus a tip. The tip is bigger when you arrive faster, when the meal is in good shape (crashes and hitting pedestrians damage it), and when you keep an on-time streak going.
4. Head back to McDonald's for the next order. Your best shift is saved in the browser.

| Action | Desktop | Mobile |
|---|---|---|
| Gas | `W` / `↑` | **GAS** |
| Brake / reverse | `S` / `↓` | **BRAKE** (hold) |
| Steer | `A` `D` / `←` `→` | **◀ ▶** |
| Handbrake drift | `Space` | **DRIFT** |
| Pause / mute | `P` / `M` | buttons, top right |

## The map

A stylised South Beach: Biscayne Bay and Alton Rd to the west, then Meridian Ave, Washington Ave, Collins Ave, Ocean Dr, Lummus Park, the beach, and the Atlantic. Streets run from 17th St down to 5th St. It also includes the Lincoln Road Mall, Flamingo Park, South Pointe Park, and the start of the MacArthur Causeway.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
npx serve south-beach-delivery
```

## Deploy to Netlify

The repo's root `netlify.toml` publishes this folder, so either:

- **Git deploy:** in Netlify choose *Add new site → Import an existing project*, pick this repo and branch, and deploy. The settings come from `netlify.toml` (no build command, publish directory `south-beach-delivery`).
- **Drag and drop:** drag the `south-beach-delivery` folder onto <https://app.netlify.com/drop>.
