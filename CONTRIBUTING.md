# Contributing

## Claiming or changing a subdomain

1. Fork the repository and add or edit `domains/<name>.json` (see the [README](README.md) for the format).
2. Keep the pull request to your own domain files. Changes to anything else are rejected for non-maintainers.
3. Open the pull request and wait for the validation comment. Fix any errors and push again; the check re-runs automatically.

Tips:

- Validate locally with `npm run validate` (Node.js 22 or newer, no install needed).
- To give up a domain, delete its file in a pull request.
- To transfer a domain, change `owner.github` in a pull request opened by the current owner.

## Changing the tooling

Scripts live in `scripts/` and use only Node.js built-ins (no npm dependencies). Tests use `node:test`:

```sh
npm test
```

Please keep changes small, add tests for validation or DNS logic, and never make a workflow that has secrets run code from a pull request.
