One-time gesture hint: a pill floating at the top of the screen (--tip-bg, --tip-ink, 1px hairline-strong border,
--shadow-tip, z-index --z-tip), a short sentence and a × button. Tapping anywhere on it dismisses it.
Shown once per device per place ("Hold a message to react", "Swipe to see your other teams", "Pull down to refresh"),
on touch phones only; rises in over --dur-ui on --ease-out, instant under reduced motion.
In the app: `tipHtml({ text, onclose })` in `js/ui.js`; `showTip` / `tipDone` in `js/tips.js` decide when.

```jsx
<Tip text="Hold a message to react" onClose={dismiss} />
```
