#!/usr/bin/env python

from fabric.api import *

env.user = "ubuntu"
env.use_ssh_config = True
env.note = ""
env.dockerized = False
env.newrelic_application_id = ""

"""
Environments
"""
def production():
  """
  Work on production environment
  """
  env.requireNote = True;
  env.settings = 'production'
  env.hosts = [
    'api'
  ]
  env.newrelic_application_id = "3874131"

def integration():
  """
  Work on staging environment
  """
  env.requireNote = False;
  env.settings = 'integration'
  env.hosts = [
    'api-int'
  ]
  env.newrelic_application_id = "3864823"

def staging():
  """
  Work on staging environment
  """
  env.requireNote = False;
  env.settings = 'staging'
  env.hosts = [
    'api-rep_int'
  ]
  env.newrelic_application_id = "3865275"

def runnable3():
  """
  Work on staging environment
  """
  env.requireNote = False;
  env.settings = 'runnable3'
  env.hosts = [
    'runnable3.net'
  ]
"""
Branches
"""
def stable():
  """
  Work on stable branch.
  """
  env.branch = 'stable'

def master():
  """
  Work on development branch.
  """
  env.branch = 'master'

def branch(branch_name):
  """
  Work on any specified branch.
  """
  env.branch = branch_name


"""
Commands - setup
"""
def setup():
  """
  Install and start the server.
  """
  require('settings', provided_by=[production, integration, staging])
  require('branch', provided_by=[stable, master, branch])

  clone_repo()
  checkout_latest()
  install_requirements()
  boot()

def clone_repo():
  """
  Do initial clone of the git repository.
  """
  run('git clone https://github.com/CodeNow/api-server.git')

def checkout_latest():
  """
  Pull the latest code on the specified branch.
  """
  with cd('api-server'):
    run('git config --global credential.helper cache')
    run('git fetch --all')
    run('git reset --hard origin/%(branch)s' % env)
    run('git checkout -f %(branch)s' % env)
    run('git pull origin %(branch)s' % env)

def install_requirements():
  """
  Install the required packages using npm.
  """
  sudo('npm install pm2 -g')
  with cd('api-server'):
    run('npm install')

def boot():
  """
  Start process with pm2
  """
  with cd('api-server'):
    run('NODE_ENV=%(settings)s NODE_PATH=lib pm2 start server.js -n api-server -i 10' % env)
    run('NODE_ENV=%(settings)s pm2 start api-server/scripts/meetyourmaker.js -n cleanup' % env)
  # run('NODE_ENV=%(settings)s forever start api-server/scripts/refreshcache.js' % env)

def validateNote(input):
  """
  ensures note is not empty
  """
  if(bool(not input or input.isspace())):
    raise Exception('release note is REQUIRED. just jot down what is in this release alright')
  if ";" in input:
    raise Exception('can not use ; in note')
  return input

def addNote():
  """
  add note to deployment
  """
  if(env.requireNote):
    prompt("add release note: ", "note", validate=validateNote)

def track_deployment():
  """
  Update deployments for tracking
  """
  with cd('api-server'):
    branch = run('git rev-parse --abbrev-ref HEAD')
    commit = run('git rev-parse HEAD');
    author = env.author
    note = env.note
    cmd = 'curl -H "x-api-key:b04ef0fa7d124e606c0c480ac9207a85b78787bda4bfead" \
      -d "deployment[application_id]=' + env.newrelic_application_id+'\" \
      -d "deployment[description]=branch:'+branch+'" \
      -d "deployment[revision]=' + commit + '" \
      -d "deployment[changelog]=' + note + '" \
      -d "deployment[user]=' + author + '" \
      https://api.newrelic.com/deployments.xml'
    run(cmd)

"""
Commands - deployment
"""
def deploy():
  """
  Deploy the latest version of the site to the server.
  """
  require('settings', provided_by=[production, integration, staging])
  require('branch', provided_by=[stable, master, branch])

  prompt("your name please: ", "author")
  addNote()
  checkout_latest()
  track_deployment()
  install_requirements()
  reboot()
  # if env.settings is 'integration':
  #   test_int()

def reboot():
  """
  Restart the server.
  """
  if (env.dockerized):
    sudo("docker stop $(sudo docker ps -q)")
  else:
    run('forever stopall || echo not started')
    run('pm2 kill || echo no pm2')
    boot()

def test_int():
  """
  Restart the server.
  """
  with cd('api-server'):
    run('npm run test-int')

"""
Commands - rollback
"""
def rollback(commit_id):
  """
  Rolls back to specified git commit hash or tag.

  There is NO guarantee we have committed a valid dataset for an arbitrary
  commit hash.
  """
  require('settings', provided_by=[production, integration, staging])
  require('branch', provided_by=[stable, master, branch])

  checkout_latest()
  git_reset(commit_id)
  install_requirements()
  reboot()

def git_reset(commit_id):
  """
  Reset the git repository to an arbitrary commit hash or tag.
  """
  env.commit_id = commit_id
  run("cd api-server; git reset --hard %(commit_id)s" % env)

def list():
  """
  List processes running inside forever
  """
  require('settings', provided_by=[production, integration, staging])
  run('forever list')

"""
Deaths, destroyers of worlds
"""
def shiva_the_destroyer():
  """
  Death Destruction Chaos.
  """
  run('forever stop api-server/server.js')
  run('forever stop api-server/scripts/meetyourmaker.js')
  # run('forever stop api-server/scripts/refreshcache.js')
  run('rm -Rf api-server')
