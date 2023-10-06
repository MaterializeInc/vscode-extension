# Contributing to the Materialize Extension for Visual Studio Code

## Developing the Extension

Thank you for your interest in the Materialize extension for Visual Studio Code! Contributions of many kinds are encouraged and most welcome.

If you have questions, please create a GitHub issue.

### Requirements

* NPM and NodeJS
* Visual Studio Code
* Docker

### Building the Extension

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

## Testing the Extension

### Running the tests

1. Run Materialize in docker:
```bash
docker run -v mzdata:/mzdata -p 6875:6875 -p 6876:6876 materialize/materialized
```

2. Run the VSCode tests:
```bash
npm run test
```

## Cutting a release

A GitHub Action will release the new version to the Visual Studio Marketplace.

Follow these instructions to trigger the action:

1. Update the `package.json` to the new version.
2. Write the new changes to the `CHANGELOG.md`.
3. Run the following commands
    ```bash
    VERSION=vX.Y.Z
    git branch -D release
    git checkout -b release
    git commit -am "release $VERSION"
    git push --set-upstream origin release
    gh pr create
    ```
4. *Merge the pull request* and push the tag by running the following commands:
    ```bash
    git checkout main
    git pull
    git checkout MERGED-SHA
    git tag -am $VERSION $VERSION
    git push --tags
    gh release create $VERSION
    ```

[Materialize]: https://materialize.com
