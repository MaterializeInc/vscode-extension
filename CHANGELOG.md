# Change Log

All notable changes to the Materialize extension for Visual Studio Code will be documented in this file.

## [0.1.2] - 2023-10-06

### Added
 - Language Server Protocol (LSP) integration is now available.
 - Connections errors are now available in the Profile panel.

### Fixed
 - Staging environments connections are now working.
 - Play icon size has been corrected.
 - Fix for expired tokens

## [0.1.1] - 2023-09-15

### Added
 - Now is possible to remove profiles.

### Fixed
 - Swaping connection options as the cluster, database or schema are now working fine.
 - Improvements around the profile UI/UX.
 - Adding a profile displays an error message when the profile name is incorrect.

## [0.1.0] - 2023-09-08

Official release to the marketplace.

### Added

 - Profile names are now restricted.
 - New media content for the `README.md`.

## [0.0.5] - 2023-08-25

### Fixed
- The first query now runs correctly even when the extension is not yet activated.
- Auto-focus the panel after running a query.

## [0.0.4] - 2023-08-09

### Added
- Support for `.md` files to run SQL queries.
- Now is possible to copy the object names from the schema.
- Now is possible to run a query by pressing `CMD + ENTER` or `CTRL + ENTER`.
- Now is possible to press enter to confirm a profile name.

### Fixed
- Laggy queries do not overlap the results of newer queries anymore.
- Schema explorer does not load anymore when there is no profile available.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.
