# effect-sim's own ESLint rules

Rules that only apply to this app. The shared ones come from [mikecann-lint](https://github.com/mikecann/mikecann-lint); `eslint.config.mjs` loads this folder as the `local` plugin.

## Rules

### `no-hoisted-single-use-handlers`

**Type:** Suggestion  
**Level:** Warning

Discourages hoisting event handlers that are only used once in JSX. Instead, prefer inlining them directly where they're used.

#### ❌ Incorrect

```tsx
export function MyComponent() {
  const handleClick = () => {
    console.log("clicked");
  };

  return <button onClick={handleClick}>Click me</button>;
}
```

#### ✅ Correct

```tsx
export function MyComponent() {
  return <button onClick={() => console.log("clicked")}>Click me</button>;
}
```

#### Exception

If a handler is used multiple times, hoisting is appropriate:

```tsx
export function MyComponent() {
  const handleClick = () => {
    console.log("clicked");
  };

  return (
    <div>
      <button onClick={handleClick}>First</button>
      <button onClick={handleClick}>Second</button>
    </div>
  );
}
```

This won't trigger the warning because the handler is reused.
