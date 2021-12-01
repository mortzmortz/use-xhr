# Contributing

The commit message should be structured as follows:

```bash
<type>[optional scope]: <description>

[optional body]

[optional footer]
```

Conventional Commit matches [SemVer](https://semver.org/) through `type` in the commit message, with the following convention:

- `fix`: correlates with `PATCH` in semantic versioning.
- `feat`: correlates with `MINOR` in semantic versioning.
- `BREAKING CHANGE`: a commit that has a footer `BREAKING CHANGE:`, or appends a `!` after the type/scope, introduces a breaking API change (correlating with `MAJOR` in semantic versioning).

Read more about [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
