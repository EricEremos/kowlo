# KOWLO motion foundation

Updated 2026-09-08. Applies to the working atlas and the current Figma navigation variants.

## Colour settles into place

Photographs give the city its colours. Motion should make a change understandable, then become quiet. Geography stays anchored: a saved coordinate does not drift, bounce or move because a screen opened. The folded marks and photographic palettes carry KOWLO's identity; motion supports them.

Every effect must explain a destination change, a changed memory, or a deliberate interaction. Repeated visits should not replay an introduction or imply new achievements. Product screens carry actions, state and necessary consequences. Design rationale belongs in this document.

## Research and implementation choice

| Source | Relevant learning | KOWLO decision |
| --- | --- | --- |
| [Motion performance guidance](https://motion.dev/docs/performance) and [Motion source](https://github.com/motiondivision/motion) | Prefer suitable transform/opacity animation; browser acceleration depends on the animated property and rendering conditions. Motion offers a broader animation system. | Use transform for the shared navigation pill and opacity for changed marks. Do not claim guaranteed GPU acceleration or frame rates. |
| [Anime.js source](https://github.com/juliangarnier/anime) | Timelines and coordinated animation can serve complex scenes. | A timeline library is unnecessary for the current three small interaction patterns. |
| [WCAG: Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) | Users should be able to disable non-essential interaction-triggered motion. | Honour the operating-system reduced-motion preference, including a change while animation is running. |

The Motion and Anime.js repositories were checked as MIT-licensed and not archived during this research. Neither dependency was installed or copied. The existing application uses plain JavaScript; CSS transitions and the browser Web Animations API provide the required cancellation and interpolation without another runtime dependency. Reconsider a library only when a demonstrated interaction requires orchestration that this approach cannot maintain clearly.

These sources inform the mechanism. The timings below are KOWLO design choices, not scientifically established universal optima.

## Motion contract

| Interaction | Behaviour | Timing |
| --- | --- | --- |
| Atlas / Chapters / You | One opaque ink pill moves horizontally between equal targets. Text colour follows selection. | 220 ms, cubic-bezier(.22,1,.36,1) |
| Route change | The new title settles from 60% opacity to full opacity. The map stays still. | 180 ms, same easing |
| New or changed map mark on the same route | Changed marks fade into their final geographic cell. Unchanged marks do not replay. | 320 ms; 12 ms stagger capped at 120 ms |
| Primary or destructive button press | Small press response, retaining the full hit target. | Scale .98, 120 ms ease-out |
| Text-link hover with a mouse | Arrow moves 3 px towards its destination. | 160 ms, same easing |

No looping ambient effects, confetti, parallax, spring overshoot or entrance sequence is needed. Selection remains visible after animation ends. Changing routes cancels obsolete Web Animations effects; rapid navigation must settle on the current destination.

## Accessibility and layout

- Reduced motion removes CSS transitions and skips/cancels Web Animations effects. Content and selection appear immediately.
- Navigation remains semantic links with `aria-current`, keyboard focus and 48 px minimum targets. Animation is never the sole indicator of selection.
- The floating surface uses paper at 90% opacity, a restrained border and 20 px blur. Opaque paper is the fallback; reduced transparency disables blur; forced colours use a visible selection outline.
- Bottom spacing includes the safe-area inset and enough scroll room to reveal the final content above the navigation.
- Exact coordinates, uncertain location evidence, storage scope and export consequences remain available. Repeated slogans and technical commentary are removed from the primary reading flow.

## Figma and code

The editable component set `236:270` contains Atlas `215:235`, Chapters `236:254` and You `236:262`. Each has a shared pill layer and consistent labels. Prototype navigation uses 220 ms Smart Animate with Figma's ease-out preset. This is an approximation of the CSS easing; runtime reduced-motion behaviour is implemented in the app.

Sources: [app motion](../app/atlas.mjs), [styles](../app/styles.css), [implementation evidence](evidence/essential-motion-implementation.md). Physical-device performance and large-library animation cost remain to be measured before production release.
