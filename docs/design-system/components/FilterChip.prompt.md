Underline filter tabs — the horizontally scrolling row for leagues (Home, Standings, Commissioner), roster groups, schedule and Activity filters. Text labels on an edge-to-edge hairline; the selected one gets a 2px gold underline. Each tab is 44px tall and keeps the same weight when selected, so labels never shift. Tapping a tab that's partly off-screen scrolls the row (not the page) to show it.

```jsx
<FilterChips items={['All','EPL','NFL','NBA','NHL']} value={league} onChange={setLeague} />
<FilterChips items={['All','My teams','Locked in','Rank moves']} value="All" />
```
