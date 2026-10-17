Slim surface row that links somewhere: --surface fill, 1px --hairline border, radius 12, 11px 14px padding. A 13px/700
title over a 12px/600 --text-sub sub line, and a 12px/800 "go" word with › on the right. `unseen` adds the 7px gold
dot, an 800 title and a gold go word; use it only for news that's new to you (the champion row), never for state.
In the app: `linkRowHtml({ title, sub, go, unseen, onclick })` in `js/ui.js` (`.act-link`): Home's champion row, its
"still being played" row and its "More right now (N)" row.

```jsx
<LinkRow title="More right now (2)" sub="MLB Postseason · WNBA Playoffs" go="Show" onClick={open} />
<LinkRow unseen title="Drew wins the 2026/27 Season" sub="41 pts · Josh 2nd" go="History" />
```
