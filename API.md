## Temporary API endpoints docs and dependencies


### UI and API relationships


#### New box (press "New box" button)

```
  POST /contexts
    request:
      name: uuid()
      owner:
        github: user_github_id
    response:
      new context object

  POST /contexts/:new_context_id/versions
    request: empty
    response:
      new context version object

  POST /builds
    request:
      contextVersions: [:new_context_version_id]
      owner:
        github: user_github_id
    response:
      new build object
```

#### Add repo to the box (press "Add repository to the box" area)

```
  POST /contexts/:new_context_id/versions/:new_context_version_id/appCodeversions
    request:
      branch: branch name
      commit: commit
      repo: full repo name (owner/name)
    response:
      new app version code
```


### Select Docker template (click on template)

```
  PUT /contexts/:new_context_id/versions/:new_context_version_id/infraCodeVersion/actions/copy?sourceInfraCodeVersion=5452c94e72fd5a2400e72430
  GET /contexts/:new_context_id/versions/:new_context_version_id/files
  GET /contexts/:new_context_id/versions/:new_context_version_id/files/Dockerfile
```

### Enter new Dockerfile content

```
  PATCH /contexts/:new_context_id/versions/:new_context_version_id/files/Dockerfile
```

### Enter box name and press "Create box"

```
  POST /builds/:new_build_id/actions/build
    request:
      message: 'Initial Build'
    response:
      updated build object

  POST /instances
    request:
      build: 'Initial Build'
      name: instance name
      owner:
        github: user_github_id
    response:
      new instance object
```