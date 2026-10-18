Bottom sheet / modal on a 60% dark overlay. On phones it springs up (500ms, iOS sheet curve) and its rows stagger in.

```jsx
<Sheet title="Who are you?" onClose={close} contained>
  <SheetRow title="Josh" active /><SheetRow title="Drew" />
</Sheet>
```

Accessibility (js/sheet.js, automatic for every sheet): role="dialog" with aria-modal and the sheet's title as its label, focus moves into the sheet on open and back to the control that opened it on close, and the page behind is inert while it's open.
