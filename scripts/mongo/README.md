#Mongo script descriptions

###containerWhitelist.js
 * Get a list of containers attached to instances
 * These containers should not be deleted

###contextVersionsWithoutContext.js
 * Find context versions that don't have a context
 * These context versions are orphaned and should be deleted
 * This script may be old: problem may not exist anymore

###fixStuckInstancesUsingInspectError.js
 * Script must be modified before running!
 * Use this to mark instances with an inspect error
 * This forces instances to reinspect their container's when fetched

###imageWhitelist.js
 * Lists all images in use by contextVersions
 * These images should not be deleted

###printStuckStartingStopping.js
 * Prints all images stuck in starting or stopping

###updateTimedOutBuilds.js
 * Must be run after updateTimedOutVersions.js
 * Prints and fixes all builds never marked finished

###updateTimedOutVersions.js
 * updateTimedOutBuilds.js must be run right after this script
 * Prints and fixes all context-versions never marked finished


