# LMS Stability Guard

## Overview
This skill MUST be executed by agents modifying MathmatiCore core data stores (e.g. Firebase sync, Zustand) or the main UI layers. Its purpose is to prevent regression and ensure the application remains robust.

## Rules
1. **Data Consistency**: Never commit changes to `useStore.ts`, `useAuthStore.ts`, or `useChatStore.ts` without verifying that state changes do not cause race conditions. Always use `get()` and `set()` safely.
2. **Type Safety**: Never use `any` in state declarations. Always define strict TypeScript interfaces for API responses and Firebase objects.
3. **Firebase Subscriptions**: Every `onValue` listener must return an `off()` cleanup function. Never leak listeners on unmount or re-auth.
4. **UI UDL Standards**: All components must use `ws-bg`, `ws-surface`, `ws-ink` css variables. No ad-hoc hex colors. No overlapping scrollbars (strict max `100vh` for workspace). Avoid native spinners; prefer glassmorphism skeletons.
5. **Validation**: After modifying a file, you MUST verify no build errors are introduced using `npx tsc --noEmit`.
6. **No Phantom Elements**: When fixing Playwright tests, do not bypass missing elements, investigate *why* they are missing and fix the render tree.
