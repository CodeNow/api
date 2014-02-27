#!/usr/bin/env python

from fabric.api import *

env.user = "ubuntu"
env.use_ssh_config = True

"""
Environments
"""
def production():
  """
  Work on production environment
  """
  env.settings = 'production'
  env.hosts = [
    'api'
  ]

def integration():
  """
  Work on staging environment
  """
  env.settings = 'integration'
  env.hosts = [
    'api-int'
  ]

def staging():
  """
  Work on staging environment
  """
  env.settings = 'staging'
  env.hosts = [
    'api-rep_int'
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
    run('git fetch --all')
    run('git reset --hard origin/%(branch)s' % env)

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


"""
Commands - deployment
"""
def deploy():
  """
  Deploy the latest version of the site to the server.
  """
  require('settings', provided_by=[production, integration, staging])
  require('branch', provided_by=[stable, master, branch])

  checkout_latest()
  install_requirements()
  reboot()
  # if env.settings is 'integration':
  #   test_int()

def reboot():
  """
  Restart the server.
  """
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
