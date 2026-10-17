What sits above your teams on Home: a column with a 10px gap and 18px below it; its items keep their own recipes but
drop their own margins. At most two items show, in one written order (docs/home-priority-plan.md); the rest fold into
one neutral LinkRow, "More right now (N)", which opens them in place with the row stagger (instant under reduced
motion). Never gold for the fold row: gold means you or locked points.
In the app: `homeStackHtml({ itemsHtml, more })` in `js/ui.js`, ordered by `orderHomeItems` in `js/home-stack-math.js`.

```jsx
<HomeStack more={{ title: 'More right now (3)', sub: 'NCAA Tournament · MLB Postseason · WNBA Playoffs', onClick: open }}>
  <PostseasonCard league="cfb" /><PostseasonCard league="nfl" />
</HomeStack>
```
