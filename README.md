# Introduction

<!-- - Add your project logo.
- Write a short introduction to the project.
- If you are using badges, add them here. -->

Welcome to Dotfilers! A CLI tool that automates the management of system configuration files (dotfiles) simply and transparently with blazing fast efficiency.

## :ledger: Index

- [Introduction](#introduction)
  - [:ledger: Index](#ledger-index)
  - [:beginner: About](#beginner-about)
  - [:zap: Usage](#zap-usage)
    - [:electric\_plug: Installation](#electric_plug-installation)
    - [🪜 Setup](#-setup)
    - [:package: Commands](#package-commands)
    - [🛠️ Configuration](#️-configuration)
  - [:wrench: Development](#wrench-development)
    - [:notebook: Pre-Requisites](#notebook-pre-requisites)
    - [:nut\_and\_bolt: Development Environment](#nut_and_bolt-development-environment)
    - [:hammer: Build](#hammer-build)
    - [:rocket: Deployment](#rocket-deployment)
  - [:cherry\_blossom: Community](#cherry_blossom-community)
    - [:fire: Contribution](#fire-contribution)
    - [:cactus: Branches](#cactus-branches)
  - [:lock: License](#lock-license)

## :beginner: About

<!-- Add a detailed introduction about the project here, everything you want the reader to
know. -->

This project began as a simple script to help keep my dotfiles repository in check with minimal effort (laziness ftw :P). Eventually, as things grew, so did the sophistication of my script, to the point where I felt the idea it leveraged was robust enough to be generalized. Hence this project!

Dotfilers helps you manage your system configuration files with ease. It's implementation is also pretty straightforward! Essentially, it's all symbolic links 😃. Symbolic links are very powerful as they allow us keep files up to date with pointers that reference those files from any part of our file system. What's more, paths to these pointers can also be used in place of the path to the actual file being referred to because the pointer's path still resolves to the actual file.

However, for all this to work, the CLI imposes a minimal required structure on your dotfiles repository, so certain things can be kept track of.

The CLI requires that you encapsulate configuration files into special directories known as "_configuration groups_" or "config group" for short. A config group is a directory of system configuration files (preferably related, but not a hard requirement) with a special association file, called a `destinations.json` file, that maps each configuration file to a destination path.

Although, it sounds very simple (because it is), this file is has added capabilities such as:

- The ability to configure a destination for all configuration files at once using the `all` key which also doubles as a value if you wanted to set all configuration files to be excluded with `exclude` key.
- We can direct sets of configuration files to a single destination path using globs as keys in the file
- Paths support all available shell variables, even the `~`. Destination paths must be absolute, not relative

Config groups can have any name, but names that collectively represent the nature or use case of the configuration files housed within them are best. For instance, if you had a config group that contained all your `git` configuration, you wouldn't name it `cherry`. The name `git` is better because it is semantic.

Here is an example of what your dotfiles directory structure might look like

```txt
.
├── git/
│   ├── .gitconfig
│   ├── destinations.json
│   └── .gitignore
├── npm/
│   ├── destinations.json
│   └── .npmrc
├── shell/
│   ├── .zshrc
│   ├── destinations.json
│   └── .bash_aliases
└── cava/
    └── .config
```

The `git`, `shell`, and `npm` directories are all config groups, but not the `cava` directory since it doesn't have the `destinations.json` file.

Your structure can be flat (recommended), but it can also be nested, that is, you can have config groups within other config groups or regular directories within config groups. In the case of nested directories, you can reference nested files from the top level `destinations.json` file.

However, if the nested directory is a config group, then the parent directory's `destinations.json` file cannot reference any files within it. Nested config groups are isolated from their parents and function much like separate directories.

## :zap: Usage

<!-- Write about how to use this project. -->

### :electric_plug: Installation

<!-- - Steps on how to install this project, to use it.
- Be very detailed here, For example, if you have tools which run on different operating
  systems, write installation steps for all of them. -->

Installation is simple. All you need is node and npm.

```bash
npm i -g dotfilers
```

### 🪜 Setup

**The CLI relies on one of two environment variables for the path to your dotfiles directory: `$DOTS` or `$DOTFILES`**. Ideally, either one (or both) of these variables should be defined and available permanently. This can be achieved by defining them in your shell config file (like a .bashrc or .zshrc) or an alias file sourced on shell startup.

> **IMPORTANT**: Either the `$DOTS` or `$DOTFILES` shell variables must be set as the CLI depends on them to function properly.

<!-- Speak on the anatomy of the `destinations.json` file -->

### :package: Commands
<!-- - Commands to start the project. -->

The CLI has four commands

- `link`: Receives the names of configuration groups as arguments and, by default, creates symbolic links of the **un-excluded** files within each listed configuration group. The destination path of the ensuing symbolic links are determined by associations listed in the `destinations.json` file of the corresponding configuration group. If the destination path does not exist, it is created, regardless of how nested it is.

- `unlink`: The opposite to `link`. Functions in much of the same way, except rather than placing symbolic links at a destination path, it deletes the symbolic links of the files in the configuration groups, using the corresponding `destinations.json` as lookup reference for where the links are

- `create`: Bootstraps a new configuration group with a default `destinations.json` file

- `sync`: Synchronizes dotfiles directory with corresponding remote repository. **Note,** your dotfiles directory must be a git repository for this command to work.

Each command also has a set of options that augment its behavior. Use the `dfs --help` command to find out more.

### 🛠️ Configuration

Below is an example of a sample `destinations.json` file for the `shell` directory in the above illustration:

```json
{
  ".zshrc": "~",
  ".bash_aliases": "$HOME"
}
```

> Notice how we refer to files by their names and not by some relative path

When we invoke the `link` command (`link shell`), we would be creating symbolic links for the `.zshrc` and `.bash_aliases` files in the home directory. We could set a default destination for all files in the `shell` configuration group with the following file disposition:

```json
{
  "all": "~"
}
```

The `all` key is a reserved one that collectively refers to _all_ files within a config group. It can also be used to specify a general default destination for files not explicitly associated with a destination path in the JSON. **Implicitly, though, all files default to having their symbolic links placed in the home directory**

To keep certain files from having symbolic links created and positioned somewhere in your file system, we can list them as part of the values for the `exclude` key, as so:

```json
{
  "exclude": ["example.json", "*.toml", ".xresources"]
}
```

This is another reserved key that takes either an array of filenames and globs or the string "`all`" as values.

```json
{
  "exclude": "all"
}
```

If it has a value of "`all`", all config files in the configuration would be skipped over by both the `link` and `unlink` commands.

Finally, here is a full on sample `destinations.json` file

```json
{
  "config-file-name.json":"$HOME/.local/app",
  "inner/nested-file.rs": "$HOME",
  "*.toml": "$CUSTOM_VAR/.local/toml-configs",
  "exclude": ["*.js", "*.txt", ".gitconfig"],
  "all": "~/default"
}
```

## :wrench: Development

<!-- If you want other people to contribute to this project, this is the section, make sure you
always add this. -->

### :notebook: Pre-Requisites

To work or contribute to the code of this project, you require the following:

- Knowledge of functional programming, beyond purity, array methods, and immutability. Knowledge of things like
  - Modelling side effects with algebraic data structures
  - Optics
- Knowledge of [fp-ts](https://github.com/gcanti/fp-ts)
- Comfortable with Typescript

### :nut_and_bolt: Development Environment

Setup is easy, it's just like any other node project written in TypeScript with NPM as the package manager

<!-- ### :file_folder: File Structure

Add a file structure here with the basic details about files, below is an example.

```
.
├── assets
│   ├── css
│   │   ├── index-ui.css
│   │   └── rate-ui.css
│   ├── images
│   │   ├── icons
│   │   │   ├── shrink-button.png
│   │   │   └── umbrella.png
│   │   ├── logo_144.png
│   │   └── Untitled-1.psd
│   └── javascript
│       ├── index.js
│       └── rate.js
├── CNAME
├── index.html
├── rate.html
└── README.md
```

| No  | File Name | Details     |
| --- | --------- | ----------- |
| 1   | index     | Entry point | -->

### :hammer: Build

Nothing serious, just run the command:

```bash
npm run build
```

### :rocket: Deployment

Deployments to the NPM registry occur automatically on successful pull requests to the `main` branch. The nature of the commit determines the kind of release that occurs.

## :cherry_blossom: Community

<!-- If it's open-source, talk about the community here, ask social media links and other links. -->

### :fire: Contribution

Your contributions are always welcome and appreciated. Following are the things you can do to contribute to this project.

1. **Report a bug** - If you think you have encountered a bug, and I should know about it, feel free to report it [here](https://github.com/OlaoluwaM/dotfilers/issues) and I will take care of it.

2. **Request a feature** - You can also request for a feature [here](https://github.com/OlaoluwaM/dotfilers/issues), and if it will viable, it will be picked for development.

3. **Create a pull request** - It can't get better then this, your pull request will be appreciated by the community. You can get started by picking up any open issues from [here](https://github.com/OlaoluwaM/dotfilers/issues) and make a pull request.

> If you are new to open-source, make sure to check read more about it [here](https://www.digitalocean.com/community/tutorial_series/an-introduction-to-open-source) and learn more about creating a pull request [here](https://www.digitalocean.com/community/tutorials/how-to-create-a-pull-request-on-github).

### :cactus: Branches

The main branch is the production/release branch. All other branches are feature branches and should be deleted when no longer needed. I initially had a development branch, but keeping it in sync with the master branch became a bit of a hassle, and it's a relatively small project

<!--
I use an agile continuous integration methodology, so the version is frequently updated
and development is really fast.

1. **`stage`** is the development branch.

2. **`master`** is the production branch.

3. No other permanent branches should be created in the main repository, you can create
   feature branches but they should get merged with the master.

**Steps to work with feature branch**

1. To start working on a new feature, create a new branch prefixed with `feat` and
   followed by feature name. (ie. `feat-FEATURE-NAME`)
2. Once you are done with your changes, you can raise PR.

**Steps to create a pull request**

1. Make a PR to `main` branch.
2. Comply with the best practices and guidelines e.g. where the PR concerns visual
elements it should have an image showing the effect.
3. It must pass all continuous integration checks and get positive reviews.

After this, changes will be merged. -->

<!-- ### :exclamation: Guideline

coding guidelines or other things you want people to follow should follow.

## :question: FAQ

You can optionally add a FAQ section about the project.

## :page_facing_up: Resources

Add important resources here -->

<!-- ## :camera: Gallery

Pictures of your project. -->

<!-- ## :star2: Credit/Acknowledgment

Credit the authors here. -->

## :lock: License

[MIT License](LICENSE)
