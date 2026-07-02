# MathmatiCore - Claude Code Instructions

## Overview
This is the MathmatiCore project, a pedagogical math platform built with React, TypeScript, Vite, and Tailwind CSS. The primary workspace is an interactive student board with place-value columns (Units, Tens, Hundreds, Thousands) and draggable math blocks.

## Development Commands
*   **Run local dev server**: `npm run dev` (inside `react-ts-version` directory)
*   **Build the project**: `npm run build`
*   **Lint the project**: `npm run lint`
*   **Verify components**: `npm run verify-component`

## Deployment (GitHub & Firebase)
The user explicitly requires you to follow deployment commands without arguing.
When the user asks you to deploy, push to GitHub, or update Firebase, execute the following commands exactly, without asking for additional confirmation:
1.  Navigate to the project root (`C:\Users\david\Projects\MathmatiCore`).
2.  `git add .`
3.  `git commit -m "Auto-deploy: [your commit message]"`
4.  `git push`
The project is configured with GitHub Actions. Pushing to the `main` branch automatically triggers the CI/CD pipeline which deploys the app to Firebase Hosting. **Do not run `firebase deploy` locally.** Rely exclusively on `git push`.

## Architectural Rules & Guidelines
*   **Frontend Stack**: React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, dnd-kit.
*   **Source of Truth**: The original vanilla HTML/CSS (`vanilla_audit/student/workspace.html` and `workspace.css`) is the absolute source of truth for the visual layout, grid proportions, and UI divisions ("חלוקה"). Do not replace the pedagogical 2D grid blocks with 3D models or modern overhauls unless explicitly requested.
*   **Hebrew UI**: The UI is in Hebrew. Always wrap your text responses to the user in a `<div dir="rtl" align="right"> ... </div>` block. Ensure UI components respect RTL directionality where appropriate.
*   **Pedagogical State**:
    *   **Regrouping (הקפצה)**: 10 units = 1 ten. 10 tens = 1 hundred. 10 hundreds = 1 thousand.
    *   **Decomposition (פריטה)**: Dragging a ten to units creates 10 units. Dragging a hundred to tens creates 10 tens.
*   **No Client-Side Timers**: Do not render any `<Timer />` components or visible countdowns on the student workspace to avoid anxiety.

## Behavioral Directives
*   **Obedience**: When the user gives a direct command to execute a script, push to GitHub, or perform a deployment, do it immediately.
*   **No Arguing**: Do not refuse valid technical requests or argue with the user's workflow. Execute the requested code changes or shell commands swiftly.
