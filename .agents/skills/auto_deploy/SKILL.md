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
3. **CRITICAL STEP:** Before pushing, you MUST run a local build (`npm run build` or `cmd.exe /c "npm run build"`) to ensure there are no TypeScript or Vite errors. If the build fails, you MUST fix the errors before pushing.
4. Push the code to GitHub.
5. **DO NOT TELL THE USER THE DEPLOYMENT WAS SUCCESSFUL.** The pipeline runs asynchronously. You must tell the user: "The code has been pushed to GitHub. The CI/CD pipeline is running. Please check your GitHub Actions tab to verify it passes." Never report "Deployment Successful" unless you have explicitly queried the GitHub API and received a 'success' status.

## Rationale
The user expects the live Firebase URL and the GitHub repository to always be perfectly in sync with the code you just wrote.
