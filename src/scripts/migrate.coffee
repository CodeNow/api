mongoskin = require 'mongoskin'

# iterate through existing channels and port existing data into new channels collection
# ensure the aliases are correct

# iterate through existing channels and look at array of category strings
# create categories inside new collection based on the labels we find

# iterate through each container and image, and look at the name of each tag
# check if a channel exists for that tag already (look in aliases?)
# if a channel cannot be found then create a new one with that name as the canonical name