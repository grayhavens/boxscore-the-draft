iOS-style recessed track with a raised thumb that slides (340ms, ease-out) — every view toggle (Live/Upcoming/All, League/Drafted, Standings/Activity/Race).

```jsx
<SegmentedControl options={['Standings','Activity','Race']} value={seg} onChange={setSeg} />
<SegmentedControl options={[{value:'act',label:'Activity',badge:3}]} value="act" />
```

Quieter than gold chips on purpose — never fill it with accent.
