[![Status Badge](https://circleci.com/gh/CodeNow/api.png?circle-token=15c68bfd7d9ca99637f0c5a6e05505366f5d9fd3)](https://circleci.com/gh/CodeNow/api)

Help and Tips
=============

### Problems npm installing?

This may be because you're getting access denied from npm - which is trying to clone a private repo (runnable-api-client)
Make sure you set up a ssh key with github and ssh-add it. (ssh-add ~/.ssh/github_rsa)
[https://github.com/settings/ssh](Your github ssh keys)

### Rapid Prototyping with Runnable-Api-Client

If you find yourself working on a feature that constantly involves updating the runnable-api-client, use npm link.
```bash
cd <runnable-api-client-path>
npm link
cd <runnable-api>
npm link runnable
# ... after you've commited some runnable-client changes and updated the version
npm run client-version # this will update the client's version to the latest in the package.json - remember to commit it.
```
