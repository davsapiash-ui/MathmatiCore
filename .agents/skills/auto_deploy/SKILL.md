---
name: auto_deploy
description: "Automatically commit, push to GitHub, and deploy to Firebase after significant code changes are completed."
---

# Auto Deploy Skill

## Trigger
Whenever you have completed a set of requested code changes, or when the user asks for updates to be published.

## Instructions
1. Go to the root of the project (`C:\Users\david\Projects\MathmatiCore`).
2. Run the following commands to commit and push the code to GitHub:
   `git add .`
   `git commit -m "Auto-deploy: [Brief description of changes]"`
   `git push`
3. Make sure that the CI/CD to Firebase runs successfully (e.g. by checking GitHub actions or notifying the user that the CI/CD pipeline has been triggered).
4. Do not ask for user permission before committing and pushing if the user explicitly requested a deployment. Do not run `firebase deploy` locally; rely entirely on the GitHub CI/CD pipeline.

## Rationale
The user expects the live Firebase URL and the GitHub repository to always be perfectly in sync with the code you just wrote.
