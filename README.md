# dsh-skills-hub

A DSH browser-client plugin for browsing and managing Skills stored in DSH's global directory and registered workspaces.

[简体中文](README.zh.md)

## Overview

`dsh-skills-hub` adds **Settings → Skills** to a DeepSeek Harness (DSH) browser client. It manages Skill directories without changing the DSH core runtime or pretending to provide unsupported Skill lifecycle controls.

The plugin is intended for a DSH deployment with a browser client: either the desktop application with an embedded Web UI or the DSH Web version.

## Current capabilities

- Browse installed Skills with names, descriptions, Markdown files, paths, and symlink targets.
- Search installed Skills by name or description.
- Switch between the global Skill directory and registered DSH workspaces.
- Detect available Skill directories from Codex, Claude Code, ZCode, WorkBuddy, and QCoderWork, then scan their counts before the import dialog is ready.
- Inspect scanned external Skills on demand by expanding a source group.
- Import Skills by copying their directories or creating directory symlinks.
- Upload a local Skill folder into the global directory or a registered workspace.
- Skip an existing destination with the same Skill name instead of overwriting it.
- Delete Skill directories or recognized symlinks safely.
- Show an import result summary with imported, skipped, and failed items.

> DSH currently does **not** support runtime enable/disable for an individual Skill. This plugin does not expose a display-only switch for that unsupported behavior.

## Quick start

### Prerequisites

- A supported DSH browser client: desktop Web UI or DSH Web.
- Permission to install a DSH profile dependency and edit its `cordis.yml`.

### Install the package

```sh
pnpm add @lcthe/dsh-skills-hub
```

Add the plugin at the same include level as the other bundle rows in your profile's `cordis.yml`:

```yaml
- insert:
    - id: dsh-skills-hub
      name: '@lcthe/dsh-skills-hub'
```

Start the DSH Web client:

```sh
pnpm dsh web
```

Open **Settings → Skills** after DSH starts.

## Usage

### Browse installed Skills

The main page scans the selected DSH Skill directory and displays each Skill's name, description, path, Markdown files, and symlink information. Use the search field to filter by name or description.

### Switch the Skill scope

Use the scope selector to switch between:

- **Global:** `~/.dsh/skills/`
- **Registered workspace:** `<workspace>/.dsh/skills/`

Workspace options come from the DSH workspace registry. They are not a claim that DSH has one universal “current workspace”.

### Import from another Agent

1. Open **Import**.
2. The plugin detects which supported Agent directories exist and scans them to calculate the available Skill counts.
3. Source groups remain collapsed by default; expand a group to view its scanned Skills.
4. Open a Skill to inspect its description and source path.
5. Select Skills with checkboxes.
6. Choose **Copy** or **Symlink** and select the global directory or a registered workspace.
7. Confirm the import and review the result summary.

Source groups stay collapsed, but their counts are populated before the dialog is ready. Clicking the dialog's refresh button performs a new source detection and re-scans all detected sources so the displayed totals remain accurate.

Existing destination names are skipped; imports never overwrite an existing Skill directory.

### Upload a local Skill folder

Choose **Upload** on the main Skills page and select a local Skill folder. The upload is written to a temporary directory and moved into the selected destination only after validation succeeds.

### Delete a Skill

Choose **Delete** and confirm the path shown in the confirmation dialog. A recognized symlink is removed with the link itself only; its target is not followed or deleted. A normal Skill directory and its contents are removed recursively.

## Current limitations

- DSH does not currently provide a persisted runtime enable/disable setting for an individual Skill.
- `disable-model-invocation` and `user-invocable` in `SKILL.md` are static invocation policies, not user-controlled runtime toggles.
- DSH's plugin-level `disabled` setting controls an entire loader entry, not one Skill inside a provider.
- Skill content editing, folder opening, and a Skill creation wizard are not included.
- Existing Skills cannot be overwritten; same-name destinations are always skipped.
- Custom scan roots are not supported.
- Import previews show Skill metadata but not file sizes.
- A source directory may exist but contain no recognizable Skill directory; recognition requires a directory with at least one Markdown file.
- Dangling symlinks may not be discoverable because source scanning verifies that the target is a usable directory.

## Security summary

The plugin applies the following safeguards:

- Skill names must match a safe name format.
- Import, upload, and delete destinations are restricted to the global directory or registered workspace directories.
- Upload paths reject traversal segments and duplicate file writes.
- Upload limits are enforced before commit: 16 MiB request body, 500 files, 4 MiB per file, and 12 MiB total file data.
- Uploads are staged in a temporary directory and atomically renamed into place only after validation succeeds.
- Existing destination directories are never overwritten.
- Recognized symlink deletion removes the link itself rather than its target.

See [SPEC.md](SPEC.md) for the complete behavior and security contract.

## Supported import sources

| Source | Scanned paths |
|---|---|
| Codex | `~/.codex/skills/`, `~/.codex/vendor_imports/skills/`, `~/.codex/plugins/cache/*/skills/` |
| Claude Code | `~/.claude/skills/` |
| ZCode | `~/.zcode/skills/`, `~/.zcode/cli/plugins/cache/*/skills/` |
| WorkBuddy | `~/.workbuddy/skills/` |
| QCoderWork | `~/.qcoderwork/skills/` |

## Screenshots

![Skill list](docs/1.png)

![Import dialog](docs/2.png)

![Source selection](docs/3.png)

## Local development

To load a local checkout instead of the published npm package, add a `file:` dependency to the DSH profile's `package.json`:

```json
{
  "dependencies": {
    "@lcthe/dsh-skills-hub": "file:/path/to/dsh-skills-hub"
  }
}
```

Include `@lcthe/dsh-skills-hub` in `dsh.profile.bundles`, then build from the checkout:

```sh
pnpm install
pnpm run build
```

`pnpm run build` runs the TypeScript check before bundling the plugin.

## Release and maintenance

- Package name: `@lcthe/dsh-skills-hub`
- Source package version: see `package.json`.
- Published versions: verify the npm registry rather than inferring publication status from a local version field.
- Keep changes in this plugin repository. The official `deepseek-harness` source repository is not a development target for this plugin.

## Contributing

Issues and pull requests are welcome. Keep documentation and published metadata aligned with implemented behavior.

## License

MIT
