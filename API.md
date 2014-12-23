## Temporary API endpoints docs (initial coverage)


### UI and API relationships
============================

Description of what API calls are made when user performs UI actions.



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


### Rename box

```
  PATCH /instances/:id
    request:
      name: new name
    response:
      update instance object
```


### Edit box

```
  POST /builds/:build_id/actions/copy?deep=true
    request: empty
    response:
      new build object

  // change docker file
  PATCH /contexts/:context_id/versions/:context_version_id/files/Dockerfile
    request:
      body: docker file content
    response:
      file object
  // build a build
  POST /builds/:new_build_id/actions/build
    request:
      message: "Manual build"
    response:
      build object
  // poll container until found. Containers will always have one container!
  GET /instances/:instance_id/containers
    response: [new container object]
  // patch instance with a new build
  PATCH /instances/:instance_id/
    request:
      build: build_id
    response:
      instance object
```


### Stop box

```
  PUT /instances/:instance_id/actions/stop
```

### Stop box

```
  PUT /instances/:instance_id/actions/stop
```

### Fork box

```
  POST /instances/:instance_id/actions/copy
    request:
      name: forked box name
    response:
      instance object
```