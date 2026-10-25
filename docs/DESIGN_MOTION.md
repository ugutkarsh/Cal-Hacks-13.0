# Trailmap discovery — design & motion spec

Incremental polish of the **existing** map-first UI. Layout, navigation, branding, and data behavior are preserved. No invented attendees, ratings, or AI search backend.

## Visual direction (main map screen)

- Forest / sky tokens (`--brand-*`, `--marker-*`) stay primary.
- Map remains the focus; chrome is glass overlays.
- Search asks **“What do you want to do?”** with keyword filtering + suggestion chips (not AI).
- Preview cards share accent color with pins; hover lifts ~4px and emphasizes the matching pin.
- Detail panels: brand-deep sheet — slide up (mobile) / slide from right (desktop ≥640px).

## Reusable component set

| Component | Path | Variants |
|-----------|------|----------|
| `Button` | `components/ui/button.tsx` | default · secondary · ghost · outline |
| `Badge` | `components/ui/badge.tsx` | kind · mock · default |
| `Input` | `components/ui/input.tsx` | focus ring + elevated field |
| `PromptChips` | `components/ui/prompt-chips.tsx` | Sports · Outdoor · This weekend · Meet people |
| `PanelShell` | `components/ui/panel-shell.tsx` | center · sheet-right · compose |
| Map pin | `components/map/map-marker.tsx` | idle · hover · selected · recommended · emphasized |
| Preview card | `components/postcards/preview-postcard.tsx` | kind accent · hover lift · View activity |
| Detail panel | `components/postcards/detail-postcard.tsx` | mobile sheet · desktop right rail |

## Clickable prototype flows (live `/discover`)

1. **Discovery** — search / suggestion chips / category & kinds → map updates  
2. **Marker ↔ card** — select pin → preview; hover card → pin emphasize  
3. **Activity details** — **View activity** → right slide-in  
4. **Create a post** — Community → New post (scale-in)  
5. **Profile** — profile icon → panel  

Desktop: map + left search chrome + right detail. Mobile: map-first, bottom sheets.

## Motion tokens (`app/globals.css`)

| Token | Value | Use |
|-------|-------|-----|
| `--motion-fast` | `180ms` | Hover lift, pin scale, filter chips |
| `--motion-base` | `220ms` | Fade / rise / backdrop / result count |
| `--motion-panel` | `280ms` | Panel enter (within 180–300ms band) |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Most enters |
| `--ease-spring` | `cubic-bezier(0.34, 1.15, 0.64, 1)` | Compose scale (light) |

| Interaction | Duration | Easing | Behavior |
|-------------|----------|--------|----------|
| Card / button hover lift | 180ms | ease-out | `translateY(-4px)` + shadow |
| Map pin hover | 180ms | ease-out | scale 1.12 |
| Map pin selected | 180ms | ease-out | scale 1.28 + dual ring |
| Card hover → pin emphasize | 180ms | ease-out | scale 1.18 + ring |
| Preview appear / result note | 220ms | ease-out | `.discovery-rise` / `.discovery-fade-in` |
| Detail (mobile) | 280ms | ease-out | slide up |
| Detail (desktop) | 280ms | ease-out | slide from right |
| Profile / list panels | 280ms | ease-out | `.discovery-slide-up` |
| Compose post | 280ms | spring | `.discovery-scale-in` |
| Backdrop | 220ms | ease-out | `.discovery-backdrop` |
| Search status | live | — | Updating… / empty / keyword-only note |

## Reduced motion

`prefers-reduced-motion: reduce` disables transforms and enter animations. Selected / emphasized pins use a static outline instead of scale.

## Search honesty

Suggestion chips and the search field only apply **keyword + category + kind filters**. Status copy states this is not an AI search backend.
