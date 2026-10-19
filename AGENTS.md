# Coding Guidelines

Apply these rules when writing, reviewing, or refactoring code. Keep changes focused on the task and preserve existing behavior unless the task requires changing it.

## Core Principle

Write code that another developer can understand by reading it from top to bottom.

Prioritize descriptive naming, flat control flow, strict types, and clear responsibility boundaries. Prefer straightforward code over clever brevity or unnecessary abstractions.

## Naming

- Use self-descriptive names that communicate domain meaning and intent.
- Prefer `subscription`, `paymentRequest`, and `eligibleProperties` over `s`, `data`, and `items`.
- Use concrete actions such as `cancelSubscription`, `calculateMonthlyRent`, and `findExpiredSessions`.
- Avoid vague verbs such as `handle`, `process`, `manage`, and `advance` when a specific action can be named.
- Use descriptive callback parameters, including inside `map`, `filter`, and `reduce`.
- Name booleans as predicates: `isExpired`, `hasPermission`, `canWithdraw`.
- Include units when relevant: `timeoutMs`, `amountInCents`.
- Avoid abbreviations unless they are established domain terminology.
- Rename unclear code instead of adding comments that explain its names.
- Use comments to explain non-obvious decisions, constraints, or tradeoffs.

## Control Flow

- Handle invalid input, missing data, loading states, and errors first.
- Use early returns or throws to keep the main path flat.
- Keep the successful path after guards, at the lowest indentation level.
- Avoid nested `if/else` blocks.
- Do not add `else` after a branch that returns or throws.
- Omit braces for single-line `if` guards.
- Use braces for multiline bodies.
- Avoid nested ternaries and complex conditions that require mental decoding.

```ts
function calculateDiscount(order: Order): number {
  if (order.isCancelled) return 0;

  if (order.totalInCents < MINIMUM_DISCOUNT_TOTAL) return 0;

  return order.totalInCents * DISCOUNT_RATE;
}
```

## Spacing and Logical Steps

Use blank lines to make the execution flow visible.

- Separate validation, retrieval, transformation, persistence, side effects, and return values.
- Add a blank line after a guard or a tightly related group of guards.
- Keep statements belonging to the same logical step together.
- Avoid dense blocks that combine an entire workflow without spacing.
- Do not insert blank lines mechanically between every statement.

```ts
const subscription = await this.subscriptions.findById(subscriptionId);

if (!subscription) throw new SubscriptionNotFoundError(subscriptionId);

this.ensureSubscriptionCanBeCancelled(subscription);

const cancelledSubscription = await this.subscriptions.cancel(subscriptionId);

return cancelledSubscription;
```

## Functions and Abstractions

- Give each function one clear responsibility.
- Aim for functions under approximately 25 lines.
- Treat function length as a readability target, not a hard limit.
- Do not fragment a coherent operation merely to reduce its line count.
- Extract meaningful responsibilities, substantial logic, or actual reuse.
- Inline trivial expressions when a helper would make the reader jump around.
- Avoid forwarding-only functions and layers that add no meaningful behavior.
- Do not introduce generic frameworks for hypothetical future requirements.
- Use object parameters for functions with three or more arguments.

## File Organization

Keep the purpose of each file visible near the top.

- Order files as imports, essential types/constants, main implementation, then supporting helpers.
- Do not place a collection of small utility functions before the main implementation.
- Put file-local helpers below the exported component, class, or function.
- Keep service-specific helpers inside the service as private methods.
- Extract shared helpers into specifically named modules only when actual reuse justifies it.
- Avoid catch-all files such as `utils.ts`, `helpers.ts`, and `common.ts`.
- Split files by responsibility, not merely by length.
- Keep one React component per file.

## Domain-Based Architecture

Organize code by business domain. Keep domain-specific implementation inside its domain instead of collecting unrelated code in global technical directories.

### Frontend Structure

- Keep each domain’s pages, components, hooks, API functions, and types together.
- Nest components and hooks inside the page or feature that owns them.
- Keep code at the narrowest scope that needs it.
- Promote code to the domain level when multiple pages or features in that domain use it.
- Promote code to a shared directory only when multiple domains actually use it.
- Avoid global `components/` and `hooks/` directories containing domain-specific code.

Example:

```text
src/
  domains/
    properties/
      pages/
        property-details/
          property-details.page.tsx
          components/
            property-gallery.tsx
            investment-summary.tsx
          hooks/
            use-property-investment.ts
      components/
        property-card.tsx
      hooks/
        use-properties.ts
      properties.api.ts
      properties.types.ts
  shared/
    components/
      button.tsx
```

## TypeScript

- Use strict types.
- Avoid `any`, unjustified type assertions, and non-null assertions.
- Accept untrusted input as `unknown` and validate it at the boundary.
- Model mutually exclusive states as discriminated unions using `kind`.
- Avoid combinations of booleans that permit impossible states.
- Exhaustively handle closed unions and finish with an `assertNever()` check.
- Do not add exhaustive checks to ordinary conditionals.
- Define explicit parameter and return types for public service methods and exported APIs.
- Let TypeScript infer obvious local values.
- Reuse an existing `assertNever()` helper instead of duplicating it.

```ts
type PaymentState =
  | { kind: 'pending' }
  | { kind: 'paid'; receiptId: string }
  | { kind: 'failed'; reason: string };

function getPaymentLabel(state: PaymentState): string {
  switch (state.kind) {
    case 'pending':
      return 'Awaiting payment';

    case 'paid':
      return `Receipt ${state.receiptId}`;

    case 'failed':
      return state.reason;
  }

  return assertNever(state);
}

function assertNever(value: never): never {
  throw new Error(`Unexpected variant: ${JSON.stringify(value)}`);
}
```

## Expressions

- Default to `const`. Use `let` only when reassignment is necessary.
- Use `Boolean(value)` instead of `!!value`.
- Write ternaries with positive conditions: `isEnabled ? enabledValue : disabledValue`.
- Avoid inverted ternaries such as `!isEnabled ? disabledValue : enabledValue`.
- Use named intermediate values for complex expressions.
- Break dense transformation chains into meaningful steps when that improves readability.
- Avoid repeated calculations or conversions when a descriptive variable makes the intent clearer.

## React

- Keep one component per file.
- Handle loading, error, and empty states with early returns.
- Call hooks unconditionally and before conditional returns.
- Call queries and mutations in the leaf component that owns the behavior.
- Avoid drilling server data and mutation callbacks through intermediate components.
- Keep reusable presentation components driven by props.
- Use explicit ternaries for conditional JSX: `count > 0 ? <Results /> : null`.
- Never use `&&` for conditional JSX rendering.
- Prefer inline callbacks: `onClick={() => cancelSubscription(subscriptionId)}`.
- Do not hoist simple handlers solely to give them a name.
- Do not add `useCallback` by default.
- Use `useCallback` only when passing to a `memo()` child and stable identity provides a concrete benefit.
- Extract substantial interaction logic into a meaningful hook or service.
- Keep JSX focused on rendering; avoid embedding business workflows inside event callbacks.

## Promises and Errors

- Prefer `.then().catch()` for simple asynchronous calls with straightforward success and failure paths.
- Return, await, or explicitly manage promises so rejections are handled.
- Use `async/await` for sequential workflows when it makes the steps clearer.
- Use `try/catch` when recovery or contextual error translation is needed.
- Use `finally` or equivalent cleanup when work must run after both success and failure.
- Do not swallow errors or convert failures into apparent success.
- Keep loading and cleanup behavior correct on every path.
- Preserve useful error context without exposing sensitive information.
