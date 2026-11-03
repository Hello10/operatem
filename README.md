# operatem

Simple metarepo management around git submodules.

A metarepo is a git repo whose `submodules/` directory holds other repos as git submodules, with each of them a self-contained project. operatem gives that layout the handful of commands git itself is missing: see the state of every repo at once, bring them all current, commit across them, and push them in the right order.

## Install

operatem is a Node CLI. Run it from a checkout, or install it as a dependency and use the `operatem` bin.

```sh
# from a checkout of this repo
pnpm install
pnpm start status

# from a metarepo that vendors operatem as a submodule
tsx --tsconfig submodules/operatem/tsconfig.json submodules/operatem/src/cli.ts status

# or the bundled shell wrapper, which runs from any working directory
submodules/operatem/bin status
```

operatem always operates on the directory you run it from, which must be the metarepo root.

## How it thinks about submodules

Every submodule has two commits worth knowing about: the **checkout**, which is whatever is on disk in `submodules/<name>`, and the **pointer**, which is the commit the metarepo's own history records for that submodule. Committing in a submodule moves the checkout. The pointer only moves when you commit the metarepo.

Git leaves submodules in **detached HEAD** after a clone or `git submodule update`, because it checks out the pointer rather than a branch. You cannot pull or push from that state. operatem's `sync` fixes this by attaching each submodule to its tracked branch whenever the checkout sits on that branch's history, and refuses when it doesn't, so nothing is lost silently.

The tracked branch is `branch` in `.gitmodules` when set, otherwise the remote's default branch.

## The workflow

```sh
operatem status                  # where am I?
operatem sync                    # fast-forward everything, attach detached checkouts
# ... edit files in one or more submodules ...
operatem commit -m "message"     # commit each dirty submodule, then the pointers
operatem push                    # push submodules that are ahead, then the metarepo
```

`commit` writes the same message to every dirty submodule, then commits the metarepo as `bump <names>: <message>` so the pointers land in one commit. `push` goes submodules first and uses git's `--recurse-submodules=on-demand` on the metarepo as a safety net, so the metarepo can never point at a commit its remote can't reach.

`status` highlights any row that needs attention: a detached or dirty repo, commits ahead of or behind origin, a missing upstream, or a pointer that differs from the checkout. `sync`, `commit`, and `push` exit non-zero when any repo fails.

## Configuration

`operatem.json` at the metarepo root, all keys optional:

```json
{
  "submodules": "submodules",
  "packages": "packages"
}
```

`submodules` is where submodules live. `packages` is a second directory of workspaces that are part of the metarepo itself rather than submodules. Both are searched by `run` and `install`.

## Commands

The reference below is generated from the command definitions by `pnpm run docs`; `pnpm test` fails if it is stale.

<!-- commands:start -->

### add

- `operatem add --url [--name]`
  Add a new submodule, syncing a metarepo that is behind origin first
  - `--url`: Git repository URL
  - `--name`: Submodule name (defaults to repo name)

### commit

- `operatem commit -m <message> [--workspace]`
  Commit dirty submodules with a message, then commit the metarepo pointers
  - `-m`, `--message`: Commit message (-m)
  - `--workspace`: Only commit this submodule

### install

- `operatem install [--workspace] [--parallel]`
  Install dependencies for all workspaces
  - `--workspace`: Install only in specific workspace
  - `--parallel`: Install in parallel

### push

- `operatem push`
  Push submodules that are ahead, then the metarepo

### run

- `operatem run <script> [--workspace] [--parallel]`
  Run a script across workspaces
  - `--workspace`: Run only in specific workspace
  - `--parallel`: Run in parallel

### status

- `operatem status [--fetch]`
  Show branch, changes, ahead/behind, and pointer state for every repo
  - `--fetch`: Fetch before comparing (default on; use --no-fetch to skip)

### sync

- `operatem sync [--bump]`
  Bring the metarepo current (rebasing local commits onto origin), fast-forward every submodule, attaching detached checkouts to their branch, then commit stale pointers for submodules on their origin tip
  - `--bump`: Commit pointer bumps after syncing (default on; use --no-bump to skip)

<!-- commands:end -->

## Development

```sh
pnpm install
pnpm test        # unit tests against throwaway git repos, then the docs check
pnpm run docs    # regenerate the command reference above
pnpm start ...   # run the CLI from source
```

Command logic lives in `src/ops/` as plain async functions that emit result lines. The Ink components in `src/commands/` only render those lines, so the operations are tested without a terminal.
