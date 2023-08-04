# Contributing to the Materialize Extension for Visual Studio Code

## Developing the provider

Thank you for your interest in the Materialize extension for Visual Studio Code! Contributions of many kinds are encouraged and most welcome.

If you have questions, please create a GitHub issue.

### Requirements

* NPM and NodeJS
* Visual Studio Code
* Docker

### Building The Provider

1. Clone the repository:
```bash
git clone https://github.com/MaterializeInc/vscode-extension.git
```
2. Install the dependencies:
```bash
npm install
```
3. Build the extension:
```bash
npm run esbuild
```

### Running and debugging the extension

The extension runs in a parallel instance of Visual Studio Code. To start it, press F5 or click the play button located in the Run and Debug section:

<img width="413" alt="Screenshot 2023-08-01 at 10 58 05" src="https://github.com/MaterializeInc/vscode-extension/assets/11491779/459dc185-6dde-422f-ab56-e3a93a8f1405">

## Testing the Provider

### Running the tests

To run the tests run:

```bash
npm run test
```

## Cutting a release

A GitHub Action will release the new version to the Visual Studio Marketplace.

Follow this instructions to trigger the action:
```bash
VERSION=vX.Y.Z
git checkout -b mz-release
git commit -am "mz: release $VERSION"
git push --set-upstream origin mz-release
gh pr create
```

*Merge the pull request* and push the tag:

```bash
git checkout main
git pull
git checkout MERGED-SHA
git tag -am $VERSION $VERSION
git push --tags
gh release create $VERSION
```

[Materialize]: https://materialize.com
