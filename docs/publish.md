To enable npm publishing, add your npm token as a GitHub secret:
Go to your repository on GitHub: https://github.com/watzak/editable.ts
Navigate to: Settings → Secrets and variables → Actions
Click "New repository secret"
Name: NPM_TOKEN
Value: Your npm access token (create one at https://www.npmjs.com/settings/YOUR_USERNAME/tokens)

How to Publish

Once the secret is set, you can publish by either:
Creating a GitHub release, or
Pushing a version tag:
git tag v0.0.4 git push origin v0.0.4
The workflow will automatically run tests, lint, build, and publish to npm. The prepublishOnly script in your package.json ensures the build runs before publishing.
Workflows are ready to use.
