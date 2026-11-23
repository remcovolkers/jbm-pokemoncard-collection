# Workspace Guidelines

## Git Workflow
- After completing a task and verifying that tests (`npm run test:all`) and the production build (`npm run build`) pass without errors, you may commit all changes (using Conventional Commits) and push directly to `origin main` without asking for confirmation first, unless the user explicitly asks not to push.
- Do not commit or push if tests or the build fail, or if unrelated sensitive files appear in `git status`.
