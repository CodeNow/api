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
  require('settings', provided_by=[production, integration])
  require('branch', provided_by=[stable, master, branch])

  clone_repo()
  checkout_latest()
  install_requirements()
  make()
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
    run('git reset --hard')
    run('git checkout %(branch)s' % env)
    run('git pull origin %(branch)s' % env)
 
def install_requirements():
  """
  Install the required packages using npm.
  """
  sudo('npm install forever -g')
  with cd('api-server'):
    run('npm install')
  
def make():
  """
  Run make
  """
  with cd('api-server'):
    run('make')

def boot():
  """
  Start process with forever
  """
  run('NODE_ENV=%(settings)s forever start api-server/server.js' % env)
  run('NODE_ENV=%(settings)s forever start api-server/lib/scripts/cleanup.js' % env)

"""
Commands - deployment
"""
def deploy():
  """
  Deploy the latest version of the site to the server.
  """
  require('settings', provided_by=[production, integration])
  require('branch', provided_by=[stable, master, branch])
      
  checkout_latest()
  install_requirements()
  make()
  reboot()
 
def reboot(): 
  """
  Restart the server.
  """
  run('forever stopall || echo not started')
  boot()

"""
Commands - rollback
"""
def rollback(commit_id):
  """
  Rolls back to specified git commit hash or tag.
  
  There is NO guarantee we have committed a valid dataset for an arbitrary
  commit hash.
  """
  require('settings', provided_by=[production, integration])
  require('branch', provided_by=[stable, master, branch])

  checkout_latest()
  git_reset(commit_id)
  install_requirements()
  make()
  reboot()
    
def git_reset(commit_id):
  """
  Reset the git repository to an arbitrary commit hash or tag.
  """
  env.commit_id = commit_id
  run("cd api-server; git reset --hard %(commit_id)s" % env)

"""
Deaths, destroyers of worlds
"""
def shiva_the_destroyer():
  """
  Death Destruction Chaos.
  """
  run('forever stop api-server/server.js')
  run('forever stop api-server/lib/scripts/cleanup.js')
  run('rm -Rf api-server')
