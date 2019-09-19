binpub is a utility which makes republishing binaries easier.

It is extremely fragile right now, and WILL automatically PUSH git repos and PUBLISH npm packages (which is super dangerous, so be warned...).

Example commands:

After creating an empty .git repo called clang-wasm, you can make it the overarching repo/package for a binpub controlled package by running:
`binpub init clang-wasm --bins clang --addFiles wasm-ld`

On a machine that has clang installed:
`binpub add clang-wasm`


npm has to be setup to be able to publish (npm adduser).

git has to be setup to be able to push via ssh, and `git config user.name` and `git config user.email` must both be set up (`git config user.name 'preferred-user-name'`).