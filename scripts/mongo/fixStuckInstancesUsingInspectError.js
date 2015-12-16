var instanceIds = [
  ObjectId('5568f58160e9990d009c9429'),
  ObjectId('559c5de4454e150d008a1664'),
  ObjectId('55b04be1d6c4780d003314ba'),
  ObjectId('55b04be4d6c4780d003314c6'),
  ObjectId('55b7e9702431ec0d001e9ec2'),
  ObjectId('55ba921850cbb10d006c2af5'),
  ObjectId('55bbd139e9ec600d0031da48'),
  ObjectId('5549acb46825b3100080a5c9'),
  ObjectId('54db9c96791e4a1000e898f9'),
  ObjectId('5593e47a1c50680d00d0c106'),
  ObjectId('55b27bd263a8be0d00ce727d')
]

var x = db.instances.update({
  _id: { $in: instanceIds }
}, {
  $set: {
    'container.inspect': {
      error: {
        message: 'Instance action timed out'
      }
    }
  }
}, {
  multi: true
})

print(x)
