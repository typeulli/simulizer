# Docs Examples

System-level examples used by the runnable embeds in `/docs`. Each file is a
Blockly workspace serialization exported from the editor.

## Naming

`<id>.json` — `id` is a flat slug matching the `^[a-z0-9][a-z0-9_-]{0,63}$`
pattern. There are no subdirectories: docs pages reference examples by id
alone.

## Authoring an example

1. Open the workspace at `/workspace` and build the example program.
2. Verify it runs.
3. Export the workspace JSON.
4. Save it here as `<id>.json` and commit alongside the docs change.

The ` ```simulizer <id> ` fence in a markdown page renders this example as a
read‑only preview. The **Open in workspace** button opens it in a
non‑persistent workspace (`/workspace?example=<id>`) — edits are not saved
back to the example.
