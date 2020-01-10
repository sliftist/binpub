binpub is a utility which makes republishing binaries easier.

It is extremely fragile right now, and WILL automatically PUSH git repos and PUBLISH npm packages (which is super dangerous, so be warned...).

Steps to setup overarching package:

0) `yarn global add binpub`
1) Create a repo on github, with the desire package name, on the git account that is current setup on your machine (the `git config user.name` account).
2) Create a folder on your machine with the package name
3) Navigate to inside that folder
4) `git init`
5) `git remote add origin git@github.com:{gitUserName}/{packageName}.git`
6) `git push -u origin master`
7) `binpub init {packageName} --bins {primaryExecutableName} --addFiles {addFileName1} --addFiles {addFileName2}`

Steps to add binaries:
1) `binpub add {packageName}`

Requirements:
1) npm has to be setup to be able to publish (npm adduser).
2) git has to be setup to be able to push via ssh, and `git config user.name` and `git config user.email` must both be set up (`git config user.name 'preferred-user-name'`).
