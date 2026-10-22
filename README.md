# timonriemslagh.be

*kleinigheden: kleine tools voor het gewone leven.*

A one-page static site that shows my tools (Bordje, Slenter) and links to each of them.

Hosted at https://timonriemslagh.be. Design: Claude Design project "timonriemslagh.be", file "Homepage v5".

## Files

| File | What it is |
|---|---|
| `index.html` | The page: brand bar, intro, one card per tool, footer. |
| `styles.css` | All styling. |
| `favicon.svg`, `icon-180.png` | The kleinigheden mark as favicon and home-screen icon. |
| `vercel.json` | Security headers. |

## Adding a tool

Copy one `<a class="tool">` card in `index.html` and change the link, name, texts and feature chips. For a new colour, add a `--x` / `--x-bg` pair in `styles.css` with matching `.p-x` and `.o-x` classes.

## Deploying

Push to `main`; Vercel deploys it.
