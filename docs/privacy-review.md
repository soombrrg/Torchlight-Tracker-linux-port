# Source publication review

This review covers the Linux source snapshot prepared for an independent repository. It does not certify the upstream online service or future files added to Git.

## Changes

- Removed a generated desktop entry containing a machine-specific installation path. The installer creates this entry locally from its actual installation directory.
- Changed analysis paths to release-relative paths and removed temporary extraction-directory identifiers. The original-reader probe now records a stable module path when rerun.
- Removed personal gameplay timestamps, session statistics and local environment inventory from the feasibility document. No raw gameplay log was copied into the source snapshot.
- Added ignore rules for local tool configuration, credential files, environment files, game logs, generated desktop entries, downloaded Windows releases and build outputs.
- Removed the unused WebSocket listener and its vendored dependency during code review.
- Redacted username and home-directory fields in the original OS-info IPC response while preserving its API shape.
- Added English Linux documentation while preserving the upstream translation description, authorship notices and licensing information.

## Verification

- 36 unit cases pass after these changes.
- Shell scripts and the modified main process pass syntax checks.
- The desktop installer passes validation using an isolated temporary data directory; no machine-specific desktop entry is included in the source snapshot.
- The actual OS-info handler was evaluated with identity/home lookup functions that throw if called. It returned empty identity fields without invoking either lookup.
- The native Electron smoke test was rerun after hardening and verifies OS-info identity redaction, safe preload listener returns, guarded secondary windows, unauthorized-path rejection and confirmed-exit cleanup.
- The source snapshot is selected explicitly from application code, documentation, tests, launchers and license files. Its contents are checked for local identity values, absolute personal home paths, common credential patterns and forbidden runtime files before packaging.
- Archive ownership fields and timestamps are normalized; no local account name is stored in tar/gzip metadata.
- The standalone Git repository uses a GitHub no-reply commit email in repository-local configuration. No global Git configuration is changed.

## Limits

The original online UI still receives the selected log path and new game-log lines through its local bridge. Those values can contain personal information during normal operation. This review covers what is committed and packaged; it does not establish the online service's data collection or storage behavior.

Original file provenance and licensing remain in [NOTICE](../linux/NOTICE.md). The source review does not add a license grant for upstream code.
