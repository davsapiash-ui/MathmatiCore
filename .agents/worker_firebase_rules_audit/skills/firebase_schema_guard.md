---
name: firebase-schema-guard
description: >-
  Enforces a strict cross-reference between Firebase Data Schemas in code and Firebase Rules (.validate) in database.rules.json before any database write implementation.
---

# Firebase Schema Guard

## Overview
This skill acts as a strict procedural checklist to prevent "silent failures" where a frontend application attempts to write data to Firebase Realtime Database (or Firestore), but the write is rejected due to a mismatch with security rules (`.validate` or `.write`). These failures often bypass critical application logic and are hard to debug because they only appear as `PERMISSION_DENIED` errors in network logs or catch blocks.

## Dependencies
- auto_deploy

## Quick Start
Trigger this skill whenever you are about to:
1. Write a new `push`, `set`, `update`, or `remove` operation to Firebase.
2. Debug a scenario where "data is not showing up" or "the AI isn't responding".

## Workflow

### 1. Identify the Write Payload
Examine the exact structure of the data object you are sending to Firebase (e.g., `student: username` vs `student: { id: username }`).

### 2. Identify the Target Path
Trace the dynamic variables in your reference path (e.g., `ai_pending_approvals/${teacherId}`). 

### 3. Cross-Reference with Rules
Open `database.rules.json` and locate the exact path.
- Check the `.write` rule: Does the authenticated user's token match the conditions? (e.g., does the E2E test have a real token? Does the email match?)
- Check the `.validate` rule: Does your payload have all required children? Are the data types exactly matching? (e.g., `newData.child('student/id').val()` implies an object, not a string).

### 4. Implement Error Surfacing
Ensure that your `try/catch` block around the Firebase operation does not swallow the error silently. If a write is critical to the flow (e.g., generating AI tasks), a failure must halt the flow or alert the user, rather than silently navigating away.

## Common Mistakes
1. **String vs Object**: Sending a string ID instead of an object containing the ID when the `.validate` rule uses `.child('id')`.
2. **Missing Auth in Tests**: Using mock `localStorage` for authentication in E2E tests instead of genuine Firebase Auth, causing `auth == null` rejections.
3. **Plural vs Singular Keys**: Sending `strategies` in the payload when the rule expects `strategy`.
