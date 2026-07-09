---
name: semantic-telemetry-injector
description: >-
  Injects semantic event tracking into interactive UI components to generate a 
  Semantic Event Stream for the Pedagogical AI. Use this skill whenever building 
  or modifying interactive student-facing components in MathmatiCore.
---

# Semantic Telemetry Injector

## Overview
This skill guides agents on how to add "Semantic Event Streaming" to interactive components in MathmatiCore. Unlike standard analytics that count clicks, Semantic Events tell a cognitive story (e.g., "Student dragged a tens block to the units column, hesitated for 8 seconds, and then canceled"). This textual log empowers the Pedagogical AI to provide accurate Socratic feedback.

## Dependencies
- `lms_stability_guard` - Ensure that adding event listeners or `useEffect` hooks for telemetry does not cause infinite rendering loops in React.

## Workflow

When asked to build or update a student-facing interactive component (like `DienesBlock`, `MathInput`, `VerticalAdditionTask`), follow these steps:

### 1. Identify Interactive Touchpoints
- Locate all meaningful user interactions: `onDragStart`, `onDragEnd`, `onChange`, `onClick` (for hints or undos), and `onFocus`/`onBlur` (for measuring hesitation/idle time on specific elements).

### 2. Format the Semantic Payload
- Prepare a JSON object representing the action context. It must match the AI's expected schema:
  ```typescript
  const semanticEvent = {
    action: 'drag_started', // e.g., 'drag_started', 'drop_invalid', 'hesitation', 'undo'
    element: 'tens_block',  // The specific UI element the user interacted with
    target: 'units_column', // Where the action was directed (if applicable)
    context: 'Attempting to regroup manually' // Human-readable explanation of intent
  };
  ```

### 3. Inject the Dispatch Call
- Import the global store or `RadarBus` event dispatcher.
- Dispatch the event silently without blocking the UI thread. Do NOT use `await` on the dispatch inside the UI handler if it involves a network request.
  ```typescript
  // Example using a hypothetical store action
  useWorkspaceStore.getState().logSemanticEvent({
    time: Date.now(),
    ...semanticEvent
  });
  ```

### 4. Implement Hesitation Tracking (Optional but Recommended)
- For complex drop zones or inputs, set a local `setTimeout` on `onMouseEnter` or `onDragEnter`. If the user hovers for more than 5 seconds without completing an action, dispatch a `hesitation` semantic event describing exactly where they are stuck.
- Clear the timeout on `onMouseLeave`, `onDrop`, or `onChange`.

## Common Mistakes
- **Spamming Events:** Emitting an event for every single pixel of mouse movement. Only emit discrete, meaningful cognitive actions (starts, stops, drops, clicks, hesitations).
- **Silent UI Crashes:** Placing telemetry code in a way that causes a React crash if the store is undefined. Always use optional chaining (e.g., `store?.logSemanticEvent?.(...)`).
- **Generic Logging:** Sending generic labels like "button_click". Always specify the *pedagogical meaning*, e.g., "clicked_undo_after_correct_answer".
