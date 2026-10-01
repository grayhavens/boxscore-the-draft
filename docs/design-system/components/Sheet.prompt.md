Bottom sheet / modal on a 60% dark overlay. On phones it springs up (500ms, iOS sheet curve) and its rows stagger in.

```jsx
<Sheet title="Who are you?" onClose={close} contained>
  <SheetRow title="Josh" active /><SheetRow title="Drew" />
</Sheet>
```
