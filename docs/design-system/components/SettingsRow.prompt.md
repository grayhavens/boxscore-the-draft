Settings tile (surface, radius 14, 14px padding) with title, sub and a trailing control; SettingsLabel is the 11px uppercase section label.
In the app: `settingsRowHtml({ title, sub, onclick, chevron, rightHtml, switchOn, switchKey })` in `js/ui.js` (`.set-row`).

```jsx
<SettingsLabel>Alerts</SettingsLabel>
<SettingsRow title="Chat messages" sub="When the app isn't open" right={<Switch on />} />
```
